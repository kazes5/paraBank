"""JRN-01 — customer journey J02–J17 as one test (STD §5.1, call table and expected-state ledger).

Soft checks: every step runs and records its result, so one failure does not hide the rest.
At the end:
  - any failed check that is not a known defect   -> FAIL
  - a known-defect check that now passes          -> FAIL (the defect is fixed: retest and close it)
  - only known defects failed                     -> XFAIL, listing them
  - everything passed                             -> PASS
Expected balances are tracked in cents (A, B) from the balances read during the run.
"""

from datetime import datetime, timezone
from urllib.parse import quote

import pytest

from conftest import USER, cents

KNOWN = {  # check key -> defect that makes it fail today (Bug_Reports.md)
    "J06b create response balance = account balance": "BUG-009",
    "J13a responseDate is a date-time string": "BUG-015",
    "J13e loan recorded in the loan account history": "BUG-006",
}
# Month names as the /transactions/month/{month} filter expects them.
MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
# Bill-pay payee used in J10 (the payee's accountNumber is set to B at run time).
PAYEE = {
    "name": "City Utilities",
    "address": {"street": "1 Main St", "city": "Springfield", "state": "IL", "zipCode": "62701"},
    "phoneNumber": "5550100",
}


# Soft-check recorder: each check is (key, passed, detail); nothing stops the journey early
# except a step whose result later steps depend on (login, account list, createAccount).
class Journey:
    def __init__(self):
        self.results = []  # (key, ok, detail)

    # Record one check; returns whether it passed, so a step can skip its follow-up checks.
    def check(self, key, ok, detail=""):
        self.results.append((key, bool(ok), detail))
        return bool(ok)

    # Final result, compared against KNOWN: new failures or fixed known defects → FAIL;
    # only known defects failed → XFAIL; all passed → return (PASS).
    def verdict(self):
        new = ["%s (%s)" % (k, d) for k, ok, d in self.results if not ok and k not in KNOWN]
        fixed = ["%s: %s" % (KNOWN[k], k) for k, ok, _ in self.results if ok and k in KNOWN]
        known = ["%s: %s" % (KNOWN[k], k) for k, ok, _ in self.results if not ok and k in KNOWN]
        passed = sum(ok for _, ok, _ in self.results)
        summary = "%d/%d checks passed" % (passed, len(self.results))
        if new or fixed:
            pytest.fail(
                "; ".join(["new failures: " + ", ".join(new)] if new else [])
                + ("; " if new and fixed else "")
                + ("known defects no longer reproduce (retest and close): " + ", ".join(fixed) if fixed else "")
                + " — "
                + summary
            )
        if known:
            pytest.xfail("known defects: " + ", ".join(known) + " — " + summary)


# Transaction dates come as epoch milliseconds; the date filters work on the UTC day.
def utc_day(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()


def test_customer_journey(api, customer):
    # Run context: the customer, today's UTC date in the MM-dd-yyyy form the date filters use,
    # and the login path with the credentials URL-encoded.
    j = Journey()
    cid = customer["id"]
    today = datetime.now(timezone.utc).date()
    today_param = today.strftime("%m-%d-%Y")
    login_path = "/login/%s/%s" % (quote(USER["username"], safe=""), quote(USER["password"], safe=""))

    # J02–J05 onboarding
    r = api.get(login_path)
    assert r.status_code == 200, "J02 login failed: journey stops"
    me = r.json()
    j.check(
        "J02 profile = registration",
        [
            me["firstName"],
            me["lastName"],
            me["address"]["street"],
            me["address"]["city"],
            me["address"]["state"],
            me["address"]["zipCode"],
            me["phoneNumber"],
            me["ssn"],
        ]
        == [
            USER["firstName"],
            USER["lastName"],
            USER["street"],
            USER["city"],
            USER["state"],
            USER["zipCode"],
            USER["phoneNumber"],
            USER["ssn"],
        ],
    )
    j.check("J03 customer = login", api.get("/customers/%s" % cid).json() == me)
    r = api.get("/customers/%s/accounts" % cid)
    assert r.status_code == 200 and r.json(), "J04 no accounts: journey stops"
    start = {a["id"]: a for a in r.json()}
    j.check("J04 every account belongs to the customer", all(a["customerId"] == cid for a in start.values()))
    A = min(start)
    acc_a = api.get("/accounts/%s" % A).json()
    j.check(
        "J05a account A = list entry",
        [acc_a["id"], acc_a["type"], acc_a["balance"], acc_a["customerId"]]
        == [start[A]["id"], start[A]["type"], start[A]["balance"], start[A]["customerId"]],
    )
    a0 = cents(acc_a["balance"])
    # Starting point of the ledger: A's balance in cents and its existing transactions (from earlier runs).
    baseline = {t["id"] for t in api.transactions(A)}

    # J06 open savings account B
    r = api.post("/createAccount", params={"customerId": cid, "newAccountType": 1, "fromAccountId": A})
    assert r.status_code == 200, "J06a createAccount failed: journey stops"
    created = r.json()
    B = created["id"]
    j.check(
        "J06a new account is SAVINGS of the customer", created["type"] == "SAVINGS" and created["customerId"] == cid
    )
    b0 = api.balance_cents(B)
    j.check(
        "J06b create response balance = account balance",
        cents(created["balance"]) == b0,
        "response %s, account %s" % (created["balance"], b0 / 100),
    )
    # Expected-state ledger in cents: B's opening amount comes out of A. Every later step updates
    # exp_a / exp_b, and J17 compares them with the real balances.
    exp_a, exp_b = a0 - b0, b0
    j.check("J06c A = A0 − B0", api.balance_cents(A) == exp_a)
    j.check(
        "J06d account list = start + B",
        sorted(a["id"] for a in api.get("/customers/%s/accounts" % cid).json()) == sorted(list(start) + [B]),
    )

    # J07–J09 manage money
    r = api.post("/deposit", params={"accountId": B, "amount": 200})
    j.check("J07a deposit 200 to B", r.status_code == 200 and "Successfully deposited" in r.text)
    exp_b += 20000
    j.check("J07b B = B0 + 200", api.balance_cents(B) == exp_b)
    r = api.post("/withdraw", params={"accountId": B, "amount": 20})
    j.check("J08a withdraw 20 from B", r.status_code == 200 and "Successfully withdrew" in r.text)
    exp_b -= 2000
    j.check("J08b B = B0 + 180", api.balance_cents(B) == exp_b)
    r = api.post("/transfer", params={"fromAccountId": B, "toAccountId": A, "amount": 50})
    j.check("J09a transfer 50 B → A", r.status_code == 200 and "Successfully transferred" in r.text)
    exp_a, exp_b = exp_a + 5000, exp_b - 5000
    a_now, b_now = api.balance_cents(A), api.balance_cents(B)
    j.check(
        "J09b A and B after transfer",
        (a_now, b_now) == (exp_a, exp_b),
        "A %s/%s B %s/%s" % (a_now, exp_a, b_now, exp_b),
    )

    # J10 pay a bill
    r = api.post("/billpay", params={"accountId": A, "amount": 30}, body=dict(PAYEE, accountNumber=B))
    bill = r.json() if r.status_code == 200 else {}
    j.check(
        "J10a bill pay result",
        [bill.get("payeeName"), cents(bill.get("amount", 0)), bill.get("accountId")] == ["City Utilities", 3000, A],
    )
    exp_a -= 3000
    j.check("J10b A after bill", api.balance_cents(A) == exp_a)

    # J11–J12 statement and filters
    full_a = api.transactions(A)
    new_a = [t for t in full_a if t["id"] not in baseline]
    j.check(
        "J11a new rows on A = debit B0, credit 50, debit 30",
        sorted((t["type"], cents(t["amount"])) for t in new_a)
        == sorted([("Debit", b0), ("Credit", 5000), ("Debit", 3000)]),
    )
    trx_in = next((t for t in new_a if t["type"] == "Credit" and cents(t["amount"]) == 5000), None)
    full_b = api.transactions(B)
    j.check(
        "J11b rows on B = credit B0, credit 200, debit 20, debit 50",
        sorted((t["type"], cents(t["amount"])) for t in full_b)
        == sorted([("Credit", b0), ("Credit", 20000), ("Debit", 2000), ("Debit", 5000)]),
    )
    if trx_in:
        j.check("J11c transaction by id = statement row", api.get("/transactions/%s" % trx_in["id"]).json() == trx_in)
    # Each filter must return exactly the subset of the full statement that matches it (compared by ID).
    ids = lambda rows: sorted(t["id"] for t in rows)  # noqa: E731
    j.check(
        "J12a filter amount 50 = subset",
        ids(api.get("/accounts/%s/transactions/amount/50" % A).json())
        == ids([t for t in full_a if cents(t["amount"]) == 5000]),
    )
    todays = ids([t for t in full_a if utc_day(t["date"]) == today])
    j.check(
        "J12b filter onDate today = subset",
        ids(api.get("/accounts/%s/transactions/onDate/%s" % (A, today_param)).json()) == todays,
    )
    j.check(
        "J12c filter fromDate/toDate today = subset",
        ids(api.get("/accounts/%s/transactions/fromDate/%s/toDate/%s" % (A, today_param, today_param)).json())
        == todays,
    )
    month_debits = ids(
        [t for t in full_a if t["type"] == "Debit" and utc_day(t["date"]).replace(day=1) == today.replace(day=1)]
    )
    j.check(
        "J12d filter month + Debit = subset",
        ids(api.get("/accounts/%s/transactions/month/%s/type/Debit" % (A, MONTHS[today.month - 1])).json())
        == month_debits,
    )

    # J13 loan (approval depends on the customer's total balance, spec question S7)
    # Loan: an approved loan opens account L and takes the 50.00 down payment from A;
    # a denied loan must change nothing. Both branches are valid outcomes.
    accounts_before_loan = sorted(list(start) + [B])
    r = api.post("/requestLoan", params={"customerId": cid, "amount": 500, "downPayment": 50, "fromAccountId": A})
    loan = r.json() if r.status_code == 200 else {}
    j.check("J13a loan response shape", bool(loan.get("loanProviderName")) and isinstance(loan.get("approved"), bool))
    j.check(
        "J13a responseDate is a date-time string",
        isinstance(loan.get("responseDate"), str),
        "got %r" % type(loan.get("responseDate")).__name__,
    )
    L = loan.get("accountId") if loan.get("approved") else None
    if L:
        exp_a -= 5000
        j.check(
            "J13b account list = J06d + L",
            sorted(a["id"] for a in api.get("/customers/%s/accounts" % cid).json())
            == sorted(accounts_before_loan + [L]),
        )
        j.check("J13c A − down payment 50", api.balance_cents(A) == exp_a)
        j.check(
            "J13e down payment debit on A",
            any(
                t["type"] == "Debit" and cents(t["amount"]) == 5000 and "Down Payment" in t["description"]
                for t in api.transactions(A)
            ),
        )
        j.check("J13e loan recorded in the loan account history", len(api.transactions(L)) > 0)
    else:
        j.check(
            "J13b denied: account list unchanged",
            sorted(a["id"] for a in api.get("/customers/%s/accounts" % cid).json()) == accounts_before_loan,
        )
        j.check("J13c denied: A unchanged", api.balance_cents(A) == exp_a)

    # J14–J15 invest (extended)
    r = api.post(
        "/customers/%s/buyPosition" % cid,
        params={"accountId": A, "name": "QA Test Stock", "symbol": "QATS", "shares": 2, "pricePerShare": 10},
    )
    if j.check("J14a buy 2 QATS at 10", r.status_code == 200 and any(p["symbol"] == "QATS" for p in r.json())):
        # The newest QATS position is the one just bought (earlier runs may have left others).
        pos_id = max(p["positionId"] for p in r.json() if p["symbol"] == "QATS")
        exp_a -= 2000
        j.check(
            "J14b position listed with 2 shares",
            any(
                p["positionId"] == pos_id and p["shares"] == 2 for p in api.get("/customers/%s/positions" % cid).json()
            ),
        )
        pos = api.get("/positions/%s" % pos_id).json()
        j.check(
            "J14c position details", [pos["shares"], cents(pos["purchasePrice"]), pos["customerId"]] == [2, 1000, cid]
        )
        j.check("J14d A − 20", api.balance_cents(A) == exp_a)
        r = api.post(
            "/customers/%s/sellPosition" % cid,
            params={"accountId": A, "positionId": pos_id, "shares": 1, "pricePerShare": 12},
        )
        j.check("J15a sell 1 QATS at 12", r.status_code == 200)
        exp_a += 1200
        j.check("J15b position has 1 share", api.get("/positions/%s" % pos_id).json()["shares"] == 1)
        j.check("J15c A + 12", api.balance_cents(A) == exp_a)

    # J16 update profile, then restore it (extended)
    # Original profile from .env: sent with the changed street and phone, then again to restore it.
    profile = {
        k: USER[k]
        for k in (
            "firstName",
            "lastName",
            "street",
            "city",
            "state",
            "zipCode",
            "phoneNumber",
            "ssn",
            "username",
            "password",
        )
    }
    r = api.post("/customers/update/%s" % cid, params=dict(profile, street="QA Street 1", phoneNumber="5550199"))
    if j.check("J16a update street and phone", r.status_code == 200):
        c = api.get("/customers/%s" % cid).json()
        j.check(
            "J16b new street and phone, rest unchanged",
            [c["address"]["street"], c["phoneNumber"], c["firstName"], c["ssn"]]
            == ["QA Street 1", "5550199", me["firstName"], me["ssn"]],
        )
        j.check(
            "J16c login returns the updated profile", api.get(login_path).json()["address"]["street"] == "QA Street 1"
        )
        api.post("/customers/update/%s" % cid, params=profile)
        j.check("J16d profile restored", api.get("/customers/%s" % cid).json() == me)

    # J17 reconciliation
    final = sorted(a["id"] for a in api.get("/customers/%s/accounts" % cid).json())
    j.check("J17 account list = start + B (+ L)", final == sorted(list(start) + [B] + ([L] if L else [])))
    a_end, b_end = api.balance_cents(A), api.balance_cents(B)
    j.check(
        "J17 A and B = expected ledger",
        (a_end, b_end) == (exp_a, exp_b),
        "A %.2f/%.2f B %.2f/%.2f" % (a_end / 100, exp_a / 100, b_end / 100, exp_b / 100),
    )

    # PASS, XFAIL (only known defects) or FAIL, see Journey.verdict().
    j.verdict()


test_customer_journey.case = "JRN-01"
