# Coded tests — pytest + requests (Stage 7)

Five tests from the STD, automated in Python, independent of the Postman collection. They are a second, code-based implementation of the most important checks: the customer journey and the core money rules.

| STD case | Test | What it proves | Today |
|---|---|---|---|
| JRN-01 | `test_journey.py::test_customer_journey` | The whole customer journey J02–J17 in one run: onboarding, open account, deposit, withdraw, transfer, bill pay, statement and filters, loan, invest, profile update, final reconciliation against an expected-state ledger | XFAIL: only the known defects BUG-009, BUG-015, BUG-006 fail |
| TRF-01 | `test_money.py::test_transfer_conserves_total` | A transfer of 1.00 takes 1.00 from S, adds 1.00 to T, keeps the total, and writes one transaction on each side (rules A1, A2) | PASS |
| TRF-03 | `test_money.py::test_negative_transfer_rejected` | A transfer of −1.00 is rejected with a 4xx and moves no money (rule A3) | XFAIL: BUG-003 |
| DEP-01 | `test_money.py::test_deposit_increases_balance` | A deposit of 10.00 raises the balance by exactly 10.00 and writes one Credit (rule A2) | PASS |
| ACCT-03 | `test_accounts.py::test_unknown_account_returns_error` (ids −1 and 0) | An unknown account returns a 4xx and no account data (rule A8) | PASS |

**How known defects are handled:**
- The expected result is always the *correct* behavior.
- A test that fails only because of a reported defect is marked `xfail(strict=True)` with the BUG ID. The run stays green while the defect still reproduces.
- The journey uses soft checks and calls `pytest.xfail` itself when only known defects failed.
- When a defect is **fixed**, its test passes unexpectedly and the run turns red ("XPASS" / "no longer reproduces"). That is the signal to re-test and close the bug.
- Any *new* failure turns the run red too.

## Prerequisites

- **Python 3.9+.** `./run.sh auto` creates a virtual environment in `tests/automation/.venv` and installs `requirements.txt` the first time.
- **A test user in the repo's `.env`:** `PARABANK_USERNAME`, `PARABANK_PASSWORD`, `PARABANK_SSN`, `PARABANK_FIRST_NAME`, `PARABANK_LAST_NAME`, `PARABANK_STREET`, `PARABANK_CITY`, `PARABANK_STATE`, `PARABANK_ZIP` and `PARABANK_PHONE`. `./run.sh setup` registers the user and fills the IDs. Values already set in the environment take precedence over `.env`.
- **Network access** to `https://parabank.parasoft.com`.

## Run

```bash
./run.sh auto                        # from the repo root (one command)
./run.sh auto --user PARABANK2       # as the second .env user
./run.sh auto -k journey             # extra arguments go to pytest
```

Without `run.sh`:

```bash
cd tests/automation
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest
```

The suite takes about 2 minutes, because requests are paced 1.5 s apart: the public site rate-limits bursts. The tests stop on HTTP 429 and never call the admin endpoints.

## Output

Every run writes `results/runs/<UTC time>-auto/`, like the other test kinds:

| File | Content |
|---|---|
| `summary.md` | One row per test: result, its meaning, the known defect, time, and a link to the log |
| `logs/<test>.log` | Written for every failure or known-defect xfail: the assertion, then every request and response of that test (time, method, URL, body, status, duration, response), credentials redacted |
| `junit.xml` | JUnit report for CI |
| `results.json`, `run.json` | Machine-readable results, plus the run metadata used by `results/index.md` |

`--keep` moves the run to `results/kept/` (committed).

## Design notes

- **`conftest.py`:**
  - `ApiClient`: paced `requests.Session`, 5 s timeout, a per-test exchange log, redaction of the password and SSN in raw, URL-encoded, form-encoded and JSON forms.
  - Fixtures: `customer` (login once per session) and `fresh_accounts` (two new accounts S and T per money test, so tests never depend on each other or on earlier runs).
- **Read-back:** balances are always read back with a separate `GET /accounts/{id}`, never taken from the money call's own response. Amounts are compared in cents.
- **Journey branching:** the journey follows the STD call table, including the approved and denied loan branches. Loan approval depends on the customer's total balance (spec question S7).
- **Shared site:** the public site can be reset at any time by anyone. If the login fails, the session stops with a hint to run `./run.sh setup`.
