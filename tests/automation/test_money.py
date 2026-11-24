"""Endpoint tests on fresh accounts S and T (STD §5: TRF-01, TRF-03, DEP-01).

Every money test reads balances and transactions back with separate GETs; the money call's own
response is never trusted for the balance.
"""

import pytest

from conftest import cents


# Decorator: tags a test function with its STD case ID (shown in summary.md).
def case(case_id):
    def mark(fn):
        fn.case = case_id
        return fn

    return mark


# Transactions in `after` that were not in `before` (the rows a money call added).
def new_rows(before, after):
    seen = {t["id"] for t in before}
    return [t for t in after if t["id"] not in seen]


@case("TRF-01")
def test_transfer_conserves_total(api, fresh_accounts):
    """Rules A1, A2: S −1.00, T +1.00, total unchanged; one transaction on each account."""
    s, t = fresh_accounts["S"], fresh_accounts["T"]
    s0, t0 = api.balance_cents(s), api.balance_cents(t)
    # Arrange: starting balances and transaction lists, read back with separate GETs.
    s_trx, t_trx = api.transactions(s), api.transactions(t)

    # Act: transfer 1.00 S → T.
    resp = api.post("/transfer", params={"fromAccountId": s, "toAccountId": t, "amount": "1.00"})

    assert resp.status_code == 200
    assert "Successfully transferred $1.00" in resp.text
    s1, t1 = api.balance_cents(s), api.balance_cents(t)
    # Assert: each balance moved by exactly 1.00 (in cents) and the total is conserved.
    assert s1 == s0 - 100, "S should drop by 1.00"
    assert t1 == t0 + 100, "T should rise by 1.00"
    assert s1 + t1 == s0 + t0, "total S + T must not change"
    # Exactly one new transaction on each side: a Debit on S and a Credit on T.
    s_new, t_new = new_rows(s_trx, api.transactions(s)), new_rows(t_trx, api.transactions(t))
    assert [(r["type"], cents(r["amount"])) for r in s_new] == [("Debit", 100)]
    assert [(r["type"], cents(r["amount"])) for r in t_new] == [("Credit", 100)]


@case("TRF-03")
@pytest.mark.known_defect("BUG-003")
@pytest.mark.xfail(strict=True, reason="BUG-003: a negative transfer is accepted and moves money from T to S")
def test_negative_transfer_rejected(api, fresh_accounts):
    """Rule A3: amount −1.00 is rejected with a 4xx and no balance changes."""
    s, t = fresh_accounts["S"], fresh_accounts["T"]
    s0, t0 = api.balance_cents(s), api.balance_cents(t)

    # Act: a negative amount. Correct behavior: rejected, nothing moves.
    # Today the site accepts it and moves 1.00 from T to S (BUG-003), so this test is an expected failure.
    resp = api.post("/transfer", params={"fromAccountId": s, "toAccountId": t, "amount": "-1.00"})

    s1, t1 = api.balance_cents(s), api.balance_cents(t)
    assert (s1, t1) == (s0, t0), "balances changed: S %+.2f, T %+.2f" % ((s1 - s0) / 100, (t1 - t0) / 100)
    assert 400 <= resp.status_code < 500, "expected 4xx, got %s" % resp.status_code


@case("DEP-01")
def test_deposit_increases_balance(api, fresh_accounts):
    """Rule A2: S +10.00 exactly, and one Credit transaction of 10.00."""
    s = fresh_accounts["S"]
    s0, before = api.balance_cents(s), api.transactions(s)

    # Act: deposit 10.00 into S.
    resp = api.post("/deposit", params={"accountId": s, "amount": "10.00"})

    assert resp.status_code == 200
    assert "Successfully deposited $10.00" in resp.text
    assert api.balance_cents(s) == s0 + 1000
    rows = new_rows(before, api.transactions(s))
    assert [(r["type"], cents(r["amount"])) for r in rows] == [("Credit", 1000)]
