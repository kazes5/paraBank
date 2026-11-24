# Test Design Document (STD)

**Candidate:** Roy Kazes
**Date:** 2026-11-23
**System under test:** ParaBank REST API — `https://parabank.parasoft.com/parabank/services/bank`

> **How to read this document**
> - **Priority:** P1 = critical (money or security), P2 = important, P3 = nice to have.
> - **Results:** PASS, FAIL, BLOCKED (setup or environment broken), NEEDS-CLARIFICATION (no agreed rule, or behavior changed).
> - **Every expected result names its basis.** There is no product specification, so the document keeps three kinds of expectation apart:

| Label | What it is | Where it comes from | If the API behaves differently |
|---|---|---|---|
| **Contract (C#)** | What the API promises | The Swagger file only: paths, required parameters, response schemas, operation descriptions | FAIL → defect |
| **Rule (A#)** | A business rule we *propose* | Banking or REST norms; not written anywhere, not yet confirmed | FAIL → *candidate* defect, severity by risk; the rule goes to R&D for confirmation (§6) |
| **Observed (O#)** | How the system behaved during exploration | Stage 1 runs (`evidence/exploration/`) | Not a requirement. Used for test data and to make checks concrete. A difference is reported as *behavior changed* → NEEDS-CLARIFICATION, never FAIL on its own and never proof of correctness |
| **Open** | Nothing to go on (e.g. exact error codes) | — | NEEDS-CLARIFICATION → record what the API does; never counted as PASS |

---

## 1. Scope

**In scope** — the endpoints listed in the exercise:
- Login, customer details, customer accounts, account details
- Transaction list and its filters (amount, month/type, date range, single date)
- Transfer, deposit, withdraw, bill pay, request loan
- Test types: positive, negative, boundary, security (own data only), data integrity, response time, small load test

**Used only inside the customer journey** (not tested on their own):
- Open account, transaction by ID, buy/sell shares, update profile

**Out of scope:**
- Admin endpoints that affect all users (`/cleanDB`, `/initializeDB`, `/setParameter`, JMS listener) — forbidden
- Web UI testing (the UI is used only to register users and cross-check results)
- Other people's users and accounts
- Security scanning, fuzzing, stress testing
- Closed accounts (no safe way to close one)

## 2. Assumptions and derived business rules

### 2.1 Contract — from the Swagger file

| # | What the contract says | Sources disagree? |
|---|---|---|
| C1 | Every listed parameter is required; responses follow the schemas Customer, Account, Transaction, BillPayResult, LoanResponse (`loanProviderName` required). Error responses and status codes are **not** specified (only `default`) | Yes: `Transaction.date` is a `date-time` string in Swagger, a number (epoch ms) in the API |
| C2 | Filter operations return the account's transactions that match the filter ("by amount", "for a specific date", "for date range", "by month and type") | Swagger gives no date format or allowed type values |

### 2.2 Proposed business rules — need R&D confirmation

| # | Rule | Source | Confidence | Exploration showed |
|---|---|---|---|---|
| A1 | A transfer takes money from one account and adds the same amount to the other | Banking norm | High | Holds for positive amounts |
| A2 | Every money movement creates one matching transaction on each account it touches | Banking norm | High | Holds for transfer, deposit, withdraw, bill pay and the loan down payment; the loan itself is not recorded in the loan account (O4) |
| A3 | Amounts must be greater than zero | Banking norm (Swagger: any number) | High | Broken: 0 and negatives accepted |
| A4 | You can't take out more money than the account holds | Banking norm (no overdraft policy documented) | Medium | Broken: any overdraft accepted |
| A5 | Amounts have at most 2 decimals | Banking norm | High | Broken: 0.005 accepted |
| A6 | Only the logged-in owner can see or move their money | Banking norm (Swagger has no security scheme) | High | Broken: no login check |
| A7 | The same data looks the same from every endpoint | Consistency norm | High | Broken once: new-account response shows 0 (O1) |
| A8 | Bad input gets a clear 4xx error, never a server error (5xx) | REST norm | High | Broken: some bad input gives 500 |
| A9 | A failed login gives no hint whether the username exists | Security norm | High | Holds |
| A10 | You can't transfer to the same account | Banking norm | Medium | Broken: accepted |
| A11 | Bill pay needs a payee name | Banking norm; web UI form *(cross-check pending)* | Medium | Broken: empty payee accepted |
| A12 | An approved loan is recorded and the down payment is taken from the source account, both visible in the transaction history; a denied loan changes nothing | Banking norm; the web UI shows the same as the API (Stage 3 cross-check) | Medium | Partly: down payment taken and recorded on the source account; loan account history empty in the API and the UI (O4) |

### 2.3 Observed behavior — used for test data, not as requirements

| # | What we saw | Evidence | Used for |
|---|---|---|---|
| O1 | Opening an account moves an opening amount from the source account into the new one (a site setting: 100.00 on 2026-11-23, 200.00 on 2026-11-24, so tests read it); the create response shows balance 0 | `observations.json` J06, J06b | Expected balances after J06 |
| O2 | Date filters accept only `MM-dd-yyyy` (ISO dates return an empty list); month accepts a name, number or `All`; type accepts `Credit`, `Debit`, `All` (case-sensitive); `Transaction.date` is epoch ms at 00:00 UTC of the booking day | `observations.json` J11, J12a–i | Filter test data; how a row's date is read |
| O3 | A new customer starts with one checking account of 515.50 | Stage 0; exploration J04 shows A 415.50 + F 100.00 after F was opened from A | Funding of test accounts |
| O4 | Loan of 500 with 50 down was approved: a LOAN account was created holding 500.00; the source account went down by 50 and shows a "Down Payment for Loan # &lt;L&gt;" debit; the loan account has **no transactions**. The web UI shows the same. *(Stage 1 recorded no transactions on either account; Stage 3 corrected this: the down payment row exists.)* | `observations.json` J13, J13b; Stage 3 J13e; `results/kept/2026-11-24T11-21-47Z-ui/summary.md` | Loan test data; the ledger gap is evidence E14 |
| O5 | Successful money calls answer 200 with plain text starting "Successfully …" (bill pay and loan answer JSON) | `observations.json` J07–J10 | Success-message checks |
| O6 | The public site rate-limits bursts (HTTP 429); a 1.5 s pause between calls avoids it | Stage 1 run log | Request pacing; a 429 makes a test BLOCKED |
| O7 | Unloaded response times (2026-11-24 exploration, 72 paced probes): reads p50 227 ms / p95 635 ms, money writes p50 225 ms / p95 266 ms (first exploration on 2026-11-23: reads p95 670 ms, writes p95 295 ms) | `evidence/exploration/latency-baseline.md` | Basis for the SLA model (§4) |

## 3. Risks

Score = impact (1–5) × likelihood (1–3). Higher score = tested first. Likelihood is 3 where exploration already saw the problem (§5.9).

| # | Risk | Impact | Likelihood | Score | Covered by |
|---|---|---|---|---|---|
| R1 | Money is created or lost | 5 | 3 | 15 | TRF-01–03, DEP-03, WDR-03, BILL-04, JRN-01 |
| R2 | Anyone can see or move a customer's money without logging in | 5 | 3 | 15 | CUST-03, ACCT-04, AUTH-03 |
| R3 | An operation corrupts an account so it can't be read | 5 | 3 | 15 | TRF-09 |
| R4 | Accounts can be overdrawn without limit | 5 | 3 | 15 | TRF-02, WDR-02, BILL-02, LOAN-04 |
| R5 | Transaction history doesn't match balances | 4 | 3 | 12 | HIST-01, LOAN-01, TRF-04, DEP-02, WDR-04 |
| R6 | Passwords and SSNs appear in URLs and logs | 4 | 3 | 12 | AUTH-03 |
| R7 | Bad input causes server errors | 3 | 3 | 9 | TRF-07, ACCT-05, BILL-03, HIST-04, HIST-05 |
| R8 | API responses don't match the documentation | 3 | 3 | 9 | HIST-02–04, schema checks |
| R9 | Shared test site gives false results (resets, rate limits) | 3 | 3 | 9 | Smoke gate, fresh data, BLOCKED results, re-runs |
| R10 | The same data differs between endpoints | 4 | 2 | 8 | CUST-01, ACCT-02, HIST-06 |
| R11 | The API slows down under load | 3 | 2 | 6 | NFR-01, NFR-02 |

## 4. Test approach

**Three layers, run in this order**

| Order | Layer | What | Why | If it fails |
|---|---|---|---|---|
| 1 | **Smoke** (6 tests) | Login, profile, account list, account details, one small deposit and its transaction | Short and stable: in-scope endpoints only, one write, no dependency on extended endpoints. Proves the user, the site and the money path work | **Stop.** Mark everything BLOCKED, fix the user or wait for the site. Nothing else runs |
| 2 | **Endpoint tests** (39 tests) | One group per endpoint, each with its own fresh accounts | Independent: one failure never breaks another group | Normal triage; each failure stands on its own |
| 3 | **Customer journey** (JRN-01) | One end-to-end lifecycle across all endpoints; each step checks data from earlier steps | Finds problems that only appear when operations are combined | Doesn't block anything. Compare with the matching endpoint group: if that group passed, the problem is in the combination of steps |

**Making the journey robust**
- **Extended steps don't stop the journey.** If opening account B fails, the journey uses a spare own account instead. If buy/sell or profile update fails, that step is BLOCKED, and the final check leaves out its amounts.
- **Dependent steps are BLOCKED, not FAIL.** A step that needs data from a failed step is marked BLOCKED.
- **Expected balances use real values.** They are calculated from the balances actually read during the run, not hard-coded.

**Techniques**
- **Boundary values:** 0, 0.01, 0.005, exact balance, more than the balance, negative.
- **Before → action → after:** every money test reads balances and transactions before and after, and compares them in cents. A rejected request must change nothing, checked three ways: a 4xx answer, every involved account's balance unchanged, and no new row in those accounts' transaction lists (transaction IDs read just before and just after). A 200 status alone never counts as success.
- **Suite fixtures:** each endpoint group opens its own fresh accounts. If that fails, the group falls back to existing accounts for diagnostics only, and every case of the group is reported BLOCKED, never PASS or FAIL.
- **Filter oracle (subset rule):**
  - In the same run, first read the account's unfiltered transaction list.
  - A filter result must equal exactly the rows of that list that match the filter: same IDs, nothing missing, nothing extra.
  - A row's date is the calendar date of its `date` value in UTC (O2). Which timezone is intended is an open question (§6).
- **Cross-checks:** the same data is compared across endpoints, and key results against the web UI.

**SLA model** — one model for the whole document, per endpoint class:

| Class | Endpoints | p95 response time | Error rate | Timeout |
|---|---|---|---|---|
| Read | All GET (load target: `GET /accounts/{id}`) | ≤ 1000 ms | < 1 % | 5 s |
| Write | All POST: transfer, deposit, withdraw, bill pay, request loan, and the extended writes (open account, buy/sell, profile update). Load target: `POST /transfer` | ≤ 1500 ms | < 1 % | 5 s |

- **Why these numbers (O7):** unloaded reads measured p95 635–670 ms in two explorations, so the read target leaves about 1.5× headroom. Money writes measured p95 266–295 ms, but writes lock database rows and slow down fastest under concurrent load, so their target is looser. The measurements come from a small sample on a shared site; Stage 5 records a fresh baseline before the higher load.
- **How it's measured:** p95 per endpoint over all requests of a run, measured from the client.
  - An *error* is an unexpected HTTP status, a timeout, or a business failure in the body (e.g. 200 without the success text).
  - There is **no pass/fail per single request**: only timeouts (> 5 s) count as errors, and requests slower than the class p95 are listed as outliers.
  - **A p95 verdict needs at least 20 requests to the endpoint.** In functional runs (NFR-01) most endpoints have fewer, so p95 is reported for information only; the verdict comes from the load test (NFR-02). NFR-01 fails on any timeout or on any endpoint with ≥ 20 requests over its p95 target.

**Test data**
- Only our own users (<USERNAME>, <USERNAME>, or a new one created by `tests/scripts/setup-users.mjs`).
- Every run creates fresh accounts, so tests survive the site's data resets.
- Small amounts (1–200), so the expected results are easy to calculate.
- The sub-cent test (TRF-09) breaks accounts, so it runs by hand, last, on throwaway accounts.
- Passwords and SSNs are hidden in all reports.

**Tools:** Postman + Postman CLI (functional tests) · k6 (load test) · Node scripts (setup) · web UI (cross-checks).

**Entry criteria:** a user who can log in and whose account list loads · the site is up and not rate-limiting · business rules written.
⚠ *Today both users have a broken account list (caused by the sub-cent finding in §5.9). A new user or a site reset is needed before running tests.*

**Exit criteria:**
- Smoke passed.
- All P1 tests have run, and at least 12 automated tests ran with status, schema and business checks.
- The journey has run.
- Every FAIL is reproduced and documented with evidence.
- Every result that depends on a proposed rule is listed for R&D confirmation.

## 5. Test cases (minimum 25)

**47 test cases** · P1: 20 · P2: 21 · P3: 6 · Automated: 42 · Manual: 5 · Smoke: 6

| Type | Positive | Negative | Boundary | Security | Data integrity | Non-functional |
|---|---|---|---|---|---|---|
| Count | 9 | 14 | 10 | 5 | 7 | 2 |

Unless stated otherwise, every test starts with our user logged in (AUTH-01). Money tests use **S** and **T**: two fresh checking accounts created for the test. Tests marked **(smoke)** form the smoke layer.

### 5.1 Login, customer and accounts

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Valid login **(smoke)** | `GET /login` | Positive | P1 | User registered | Log in | Own credentials | **Contract (C1):** Customer schema. **Rule (A7):** details = registration data | Y — needed by every test |
| AUTH-02 | Wrong password | `GET /login` | Negative | P2 | User registered | Log in with a wrong password | Wrong password | **Rule (A9):** no customer data. **Open:** status code (401 by convention) | Y — simple check |
| AUTH-03 | Password sent in the URL | `GET /login` | Security | P2 | — | Look at the login request | Own credentials | **Rule (A6):** passwords shouldn't travel in URLs | N — design issue, noted once |
| AUTH-04 | Unknown user | `GET /login` | Security | P2 | AUTH-02 done | Log in as a user that doesn't exist | Random username | **Rule (A9):** same status and body as AUTH-02 | Y — simple compare |
| AUTH-05 | Injection in username | `GET /login` | Security | P3 | — | Log in with `' OR '1'='1` | Injection string | **Rule (A8):** error, no data, no server error | N — the site's firewall blocks it first |
| CUST-01 | View own profile **(smoke)** | `GET /customers/{id}` | Data integrity | P1 | AUTH-01 | Get customer | Own ID | **Contract (C1):** Customer schema. **Rule (A7):** same details as the login response | Y — core check |
| CUST-02 | Customer that doesn't exist | `GET /customers/{id}` | Negative | P2 | — | Get customer −1 | `-1` | **Rule (A8):** error, no data. **Open:** status code | Y — simple check |
| CUST-03 | Profile without logging in | `GET /customers/{id}` | Security | P1 | — | Get customer with no login | Own ID | **Rule (A6):** rejected, no data. **Open:** 401 or 403 | Y — most serious risk |
| ACCT-01 | List own accounts **(smoke)** | `GET /customers/{id}/accounts` | Positive | P1 | AUTH-01 | List accounts | Own ID | **Contract (C1):** list of Account. **Rule (A6):** every account has our customer ID | Y — needed by money tests |
| ACCT-02 | Account details match **(smoke)** | `GET /accounts/{id}` | Data integrity | P1 | ACCT-01 | Get each account; compare with the list (and the web UI by hand) | Own account IDs | **Contract (C1):** Account schema. **Rule (A7):** same values as the list and the UI | Y — UI part by hand |
| ACCT-03 | Account that doesn't exist | `GET /accounts/{id}` | Negative | P2 | — | Get account −1 and 0 | `-1`, `0` | **Rule (A8):** error, no data. **Open:** status code | Y — simple check |
| ACCT-04 | Account without logging in | `GET /accounts/{id}` | Security | P1 | — | Get account with no login | Own account ID | **Rule (A6):** rejected, no data. **Open:** 401 or 403 | Y — serious risk |
| ACCT-05 | Account ID that isn't a number | `GET /accounts/{id}` | Negative | P3 | — | Get account `abc` | `abc` | **Rule (A8):** 4xx with a message, no server error | Y — simple check |

### 5.2 Transfer

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| TRF-01 | Valid transfer | `POST /transfer` | Positive | P1 | S, T | Transfer S → T; check balances and transactions | 1.00 | **Rule (A1, A2):** S −1, T +1, total unchanged; one transaction on each. **Observed (O5):** "Successfully transferred…" | Y — core money rule |
| TRF-02 | More than the balance | `POST /transfer` | Boundary | P1 | S, T | Transfer more than S holds | S balance + 1000 | **Rule (A4):** rejected; balances unchanged | Y — money rule |
| TRF-03 | Negative amount | `POST /transfer` | Negative | P1 | S, T | Transfer −1 | −1 | **Rule (A3):** rejected; balances unchanged | Y — money rule |
| TRF-04 | Zero amount | `POST /transfer` | Boundary | P2 | S, T | Transfer 0 | 0 | **Rule (A3):** rejected; no transaction created | Y — ledger check |
| TRF-05 | Same account | `POST /transfer` | Negative | P2 | S | Transfer S → S | 1.00 | **Rule (A10):** rejected; nothing changes | Y — simple check |
| TRF-06 | Account that doesn't exist | `POST /transfer` | Negative | P2 | S | Transfer S → −1 | 1.00 | **Rule (A8):** error; S unchanged. **Open:** status code | Y — money safety |
| TRF-07 | Missing amount | `POST /transfer` | Negative | P2 | S, T | Transfer without an amount | — | **Contract (C1):** amount is required. **Rule (A8):** 4xx, no server error, nothing changes | Y — input check |
| TRF-08 | Same transfer sent twice | `POST /transfer` | Data integrity | P3 | S, T | Send the same transfer twice | 1.00 × 2 | **Open:** record whether it's booked twice | N — exploratory |
| TRF-09 | Amount below one cent | `POST /transfer` | Boundary | P1 | 2 throwaway accounts | Transfer 0.01, then 0.005; read both accounts | 0.01, 0.005 | **Rule (A5):** 0.005 rejected or rounded; accounts stay readable | N — breaks accounts; manual only |
| TRF-10 | Exact balance | `POST /transfer` | Boundary | P2 | S, T | Transfer S's full balance | S balance | **Rule (A1, A4):** allowed; S = 0; total unchanged | Y — valid edge |

### 5.3 Deposit, withdraw and bill pay

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| DEP-01 | Valid deposit **(smoke)** | `POST /deposit` | Positive | P1 | S | Deposit; check balance and transactions | 10.00 | **Rule (A2):** S +10; one deposit transaction. **Observed (O5):** "Successfully deposited…" | Y — core money rule |
| DEP-02 | Zero deposit | `POST /deposit` | Boundary | P2 | S | Deposit 0 | 0 | **Rule (A3):** rejected; no transaction | Y — ledger check |
| DEP-03 | Negative deposit | `POST /deposit` | Negative | P1 | S | Deposit −5 | −5 | **Rule (A3):** rejected; balance unchanged | Y — money rule |
| WDR-01 | Valid withdrawal | `POST /withdraw` | Positive | P1 | S | Withdraw; check balance and transactions | 5.00 | **Rule (A2):** S −5; one withdrawal transaction. **Observed (O5):** "Successfully withdrew…" | Y — core money rule |
| WDR-02 | More than the balance | `POST /withdraw` | Boundary | P1 | S | Withdraw more than S holds | S balance + 1000 | **Rule (A4):** rejected; balance unchanged | Y — money rule |
| WDR-03 | Negative withdrawal | `POST /withdraw` | Negative | P1 | S | Withdraw −5 | −5 | **Rule (A3):** rejected; balance unchanged | Y — money rule |
| WDR-04 | Zero withdrawal | `POST /withdraw` | Boundary | P2 | S | Withdraw 0 | 0 | **Rule (A3):** rejected; no transaction | Y — ledger check |
| BILL-01 | Valid bill payment | `POST /billpay` | Positive | P1 | S | Pay a bill; check balance and transactions | 5.00; payee "City Utilities" with full details | **Contract (C1):** BillPayResult. **Rule (A7):** it echoes the payee, amount and account sent. **Rule (A2):** S −5; one bill transaction | Y — core money rule |
| BILL-02 | More than the balance | `POST /billpay` | Boundary | P2 | S | Pay more than S holds | S balance + 1000 | **Rule (A4):** rejected; balance unchanged | Y — money rule |
| BILL-03 | No payee details | `POST /billpay` | Negative | P2 | S | Pay with an empty payee | 1.00, payee `{}` | **Rule (A11):** rejected; no money taken. **Open:** status code | Y — input check |
| BILL-04 | Negative bill | `POST /billpay` | Negative | P1 | S | Pay −5 | −5 | **Rule (A3):** rejected; balance unchanged | Y — money rule |

### 5.4 Loan

The loan has the least written down: the contract only defines the response shape, the approval rule is unknown, and how a loan should appear in balances and history is a proposed rule. Each loan test therefore checks three things separately.

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| LOAN-01 | Loan result matches the accounts | `POST /requestLoan` | Data integrity | P1 | S with ≥ 100 | Request a loan; read accounts, S, the loan account and transactions | 500, down payment 50 | **Contract (C1):** LoanResponse with `loanProviderName`, boolean `approved`; `accountId` when approved. **Rule (A12):** approved → down payment taken from S and loan + down payment appear in the history; denied → nothing changes. **Observed (O4):** loan account holds 500 — reported, not judged. **Open:** approval rule; how the loan amount should show in balances | Y — checks contract, rule and observation separately |
| LOAN-02 | Negative loan | `POST /requestLoan` | Negative | P2 | S | Request −100 | −100, down 10 | **Rule (A3):** rejected or denied; no loan account; S unchanged | Y — money safety |
| LOAN-03 | Down payment larger than the loan | `POST /requestLoan` | Boundary | P2 | S | Request 10 with 20 down | 10, down 20 | **Open:** no rule for down payment vs loan amount; record behavior | Y — edge case |
| LOAN-04 | Down payment larger than the balance | `POST /requestLoan` | Boundary | P2 | S | Request with a down payment above S, the loan amount above the down payment (so only A4 applies, not the LOAN-03 condition) | down payment = S + 10.00, loan = down payment + 100.00 | **Rule (A4):** denied; no balance change, no new transaction on S, no loan account | Y — overdraft check |

### 5.5 Transaction history

All filter tests use the **subset rule** (§4): read S's unfiltered list in the same run, then compare.

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| HIST-01 | History shows a deposit **(smoke)** | `GET /accounts/{id}/transactions` | Data integrity | P1 | DEP-01 done | List S transactions | — | **Contract (C1):** list of Transaction. **Rule (A2):** exactly one new 10.00 credit, dated today | Y — ledger check |
| HIST-02 | Filter by amount | `.../amount/{amount}` | Positive | P2 | DEP-01 done | Read S's full list; filter by 10 | 10 | **Contract (C2):** result = rows of the full list with amount 10.00 (same IDs, none missing, none extra) | Y — filter check |
| HIST-03 | Filter by date | `.../onDate`, `.../fromDate/toDate` | Positive | P2 | DEP-01 done | Read S's full list; filter by today, and from today to today | Today (`MM-dd-yyyy`, O2) | **Contract (C2):** each result = rows of the full list dated today (UTC date of `date`); onDate and from/to give the same rows | Y — filter check |
| HIST-04 | Filter by month and type | `.../month/{m}/type/{t}` | Positive | P2 | DEP-01, WDR-01 done | Read S's full list; filter with `Credit`, `Debit`, `All`; then `CREDIT` | Current month (name and number) | **Contract (C2):** each result = rows of the full list in that month with that type (`All` = every type). **Rule (A8):** unknown value → 4xx, not 500 | Y — filter check |
| HIST-05 | Wrong date format | `.../onDate/{d}` | Negative | P3 | — | Filter with `2026-11-23` and `not-a-date` | Bad dates | **Rule (A8):** 4xx with a message, not a silent empty list | Y — simple check |
| HIST-06 | One transaction by ID | `GET /transactions/{id}` | Data integrity | P3 | HIST-01 | Get one transaction from the list | ID from HIST-01 | **Rule (A7):** same fields as in the list | Y — consistency |

### 5.6 Customer journey

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| JRN-01 | Customer lifecycle journey | 14 in-scope operations + 7 extended (coverage matrix below) | Data integrity | P1 | Smoke passed; fresh user | Run calls J02–J17 in order (call table below) | Amounts in the call table | **Contract (C1, C2) + Rule (A1, A2, A7, A12):** every call passes its verification; final balances match totals calculated from the balances read during the run | Y — runs after smoke, non-blocking |

**Call table.** Every API call the journey makes, what it stores, and what it checks.
- **A** = the customer's default account; **B** = the new savings account; **L** = the loan account.
- **A0**, **B0** = balances read at J04 and J06; all later expected balances are calculated from them.
- *Read-back* = a separate `GET /accounts/{id}` right after a money call. The balance is never taken from the money call's own response.
- `full(X)` = the unfiltered transaction list of account X, read in the same run.

| Step | Call | Stores | Verification | Basis | If it fails |
|---|---|---|---|---|---|
| J01 | Register through the web UI (setup, not an API call) | username, profile | Registration page confirms the account | — | Journey not started |
| J02 | `GET /login/{username}/{password}` | `customerId` | 200; Customer schema; name, address, phone, SSN = registration | C1, A7 | **Journey stops** |
| J03 | `GET /customers/{customerId}` | — | Every field = J02 response | C1, A7 | Continue |
| J04 | `GET /customers/{customerId}/accounts` | A, A0, `startAccounts` | 200; ≥ 1 account; every `customerId` = J02 | C1, A6 | **Journey stops** |
| J05a | `GET /accounts/{A}` | — | id, type, balance, customerId = J04 entry for A | A7 | Continue |
| J05b | `GET /accounts/{A}/transactions` | `baseline` (IDs of A's existing rows) | 200; Transaction schema. Rows created before the journey (e.g. Stage 0 setup) are ignored from here on | C1 | Continue |
| J06a | `POST /createAccount?customerId&newAccountType=1&fromAccountId={A}` *(extended)* | B | 200; Account schema; `customerId` = J02; type SAVINGS | C1 | Use spare own account as B; continue |
| J06b | Read-back `GET /accounts/{B}` | B0 | 200; record B0. Report whether J06a's balance = B0 | A7; O1 says B0 = 100 and the response shows 0 | — |
| J06c | Read-back `GET /accounts/{A}` | — | A = A0 − B0 | A1 (money moved from A to B) | — |
| J06d | `GET /customers/{customerId}/accounts` | — | List = `startAccounts` + B | C1 | — |
| J07a | `POST /deposit?accountId={B}&amount=200` | — | 200; success text | C1, O5 | Later B checks BLOCKED |
| J07b | Read-back `GET /accounts/{B}` | — | B = B0 + 200 | A2 | — |
| J08a | `POST /withdraw?accountId={B}&amount=20` | — | 200; success text | C1, O5 | Continue |
| J08b | Read-back `GET /accounts/{B}` | — | B = B0 + 180 | A2 | — |
| J09a | `POST /transfer?fromAccountId={B}&toAccountId={A}&amount=50` | — | 200; success text | C1, O5 | Continue |
| J09b | Read-back `GET /accounts/{A}` and `GET /accounts/{B}` | — | A = A0 − B0 + 50; B = B0 + 130; A + B unchanged by the transfer | A1 | — |
| J10a | `POST /billpay?accountId={A}&amount=30` with payee "City Utilities" (full details) | — | 200; BillPayResult with `payeeName` "City Utilities", `amount` 30, `accountId` A | C1, A7 | Continue |
| J10b | Read-back `GET /accounts/{A}` | — | A = A0 − B0 + 20 | A2 | — |
| J11a | `GET /accounts/{A}/transactions` = full(A) | `trxIn` (the 50 credit) | Rows not in `baseline` are exactly: debit B0 (J06), credit 50 (J09), debit 30 bill (J10) | C1, A2 | Continue |
| J11b | `GET /accounts/{B}/transactions` = full(B) | — | Exactly: credit B0 (J06), credit 200 (J07), debit 20 (J08), debit 50 (J09) | C1, A2 | Continue |
| J11c | `GET /transactions/{trxIn}` *(extended)* | — | Every field = the J11a row for `trxIn` | A7 | Continue |
| J12a | `GET /accounts/{A}/transactions/amount/50` | — | = rows of full(A) with amount 50; includes `trxIn` | C2 | Continue |
| J12b | `GET /accounts/{A}/transactions/onDate/{today}` | — | = rows of full(A) dated today (UTC date of `date`, O2) | C2 | Continue |
| J12c | `GET /accounts/{A}/transactions/fromDate/{today}/toDate/{today}` | — | = rows of full(A) dated today; same rows as J12b | C2 | Continue |
| J12d | `GET /accounts/{A}/transactions/month/{current month}/type/Debit` | — | = rows of full(A) in the current month with type Debit; includes the J06 and J10 debits | C2 | Continue |
| J13a | `POST /requestLoan?customerId&amount=500&downPayment=50&fromAccountId={A}` | `approved`, L (if approved) | 200; LoanResponse with `loanProviderName` and boolean `approved`; `accountId` present if approved | C1 | Continue |
| J13b | `GET /customers/{customerId}/accounts` | — | Approved: list = J06d list + L, owned by the customer. Denied: same as J06d | A12 | — |
| J13c | Read-back `GET /accounts/{A}` | — | Approved: A − 50. Denied: A unchanged; `message` explains why | A12 | — |
| J13d | `GET /accounts/{L}` (if approved) | L balance | **Report only:** record type and balance (O4 saw LOAN, 500.00). Not judged until R&D answers Q9 | O4, Open | — |
| J13e | `GET /accounts/{A}/transactions` (and `/accounts/{L}/transactions` if approved) | — | Approved: a 50 down-payment debit on A, and a loan entry | A12 — exploration saw none (§5.9 E14) | — |
| J14a | `POST /customers/{customerId}/buyPosition?accountId={A}&name=QA Test Stock&symbol=QATS&shares=2&pricePerShare=10` *(extended)* | `positionId` | 200; list of Position contains QATS with 2 shares | C1 | BLOCKED; J15 skipped; leave out of J17 |
| J14b | `GET /customers/{customerId}/positions` *(extended)* | — | Contains `positionId` with 2 shares | C1, A7 | — |
| J14c | `GET /positions/{positionId}` *(extended)* | — | shares 2, purchasePrice 10, customerId = J02 | C1, A7 | — |
| J14d | Read-back `GET /accounts/{A}` | — | A − 20 (shares × price) | A1 | — |
| J15a | `POST /customers/{customerId}/sellPosition?accountId={A}&positionId&shares=1&pricePerShare=12` *(extended)* | — | 200; position now shows 1 share | C1 | BLOCKED; leave out of J17 |
| J15b | `GET /positions/{positionId}` *(extended)* | — | shares 1 | A7 | — |
| J15c | Read-back `GET /accounts/{A}` | — | A + 12 (shares × price) | A1 | — |
| J16a | `POST /customers/update/{customerId}` with all fields; new street and phone *(extended)* | — | 200; success text | C1 | BLOCKED; J16b–d skipped |
| J16b | `GET /customers/{customerId}` | — | New street and phone; every other field unchanged | A7 | — |
| J16c | `GET /login/{username}/{password}` | — | Still works; returns the updated profile | A7 | — |
| J16d | `POST /customers/update/{customerId}` with the original values, then `GET /customers/{customerId}` | — | Profile = registration again (keeps the user reusable) | A7 | Report; restore by hand |
| J17 | `GET /customers/{customerId}/accounts`, then `GET /accounts/{id}` for each | — | List = `startAccounts` + B (+ L if approved), nothing else. A and B = the expected-state ledger (`plan.md` §2.2). L is reported, not added to the total, until Q9 is answered | A1, A2, A12 | — |

**Coverage matrix.** Every intended operation and the journey calls that exercise it.

| # | Operation | Scope | Journey calls | Endpoint tests |
|---|---|---|---|---|
| 1 | `GET /login/{username}/{password}` | In scope | J02, J16c | AUTH-01–05 |
| 2 | `GET /customers/{customerId}` | In scope | J03, J16b, J16d | CUST-01–03 |
| 3 | `GET /customers/{customerId}/accounts` | In scope | J04, J06d, J13b, J17 | ACCT-01 |
| 4 | `GET /accounts/{accountId}` | In scope | J05a, every read-back, J13d, J17 | ACCT-02–05 |
| 5 | `GET /accounts/{accountId}/transactions` | In scope | J05b, J11a, J11b, J13e | HIST-01 |
| 6 | `GET .../transactions/amount/{amount}` | In scope | J12a | HIST-02 |
| 7 | `GET .../transactions/onDate/{onDate}` | In scope | J12b | HIST-03, HIST-05 |
| 8 | `GET .../transactions/fromDate/{fromDate}/toDate/{toDate}` | In scope | J12c | HIST-03 |
| 9 | `GET .../transactions/month/{month}/type/{type}` | In scope | J12d | HIST-04 |
| 10 | `POST /transfer` | In scope | J09a | TRF-01–10 |
| 11 | `POST /deposit` | In scope | J07a | DEP-01–03 |
| 12 | `POST /withdraw` | In scope | J08a | WDR-01–04 |
| 13 | `POST /billpay` | In scope | J10a | BILL-01–04 |
| 14 | `POST /requestLoan` | In scope | J13a | LOAN-01–04 |
| 15 | `POST /createAccount` | Extended | J06a | — (also used as test setup) |
| 16 | `GET /transactions/{transactionId}` | Extended | J11c | HIST-06 |
| 17 | `POST /customers/{customerId}/buyPosition` | Extended | J14a | — |
| 18 | `POST /customers/{customerId}/sellPosition` | Extended | J15a | — |
| 19 | `GET /customers/{customerId}/positions` | Extended | J14b | — |
| 20 | `GET /positions/{positionId}` | Extended | J14c, J15b | — |
| 21 | `POST /customers/update/{customerId}` | Extended | J16a, J16d | — |
| — | `GET /positions/{positionId}/{startDate}/{endDate}` | Out of scope | Not called | — |
| — | `/cleanDB`, `/initializeDB`, `/setParameter`, `/startupJmsListener`, `/shutdownJmsListener` | Forbidden | Never called | — |

All 21 intended operations appear in at least one journey call; the 14 in-scope ones also have their own endpoint tests.

When a journey call fails, look at the matching endpoint group (last column). If that group passed, the problem only appears when the steps are combined.

### 5.7 Performance

Both tests use the SLA model in §4.

| ID | Title | Endpoint | Type | Priority | Preconditions | Steps | Test data | Expected result | Automate? |
|---|---|---|---|---|---|---|---|---|---|
| NFR-01 | Response times in functional runs | All | Non-functional | P3 | Any automated run | Record the time of every request; group by endpoint | — | **Rule (SLA model):** no timeouts (> 5 s). p95 per endpoint is reported with its request count; a verdict only where an endpoint has ≥ 20 requests, otherwise for information. Requests over the class p95 are listed as outliers | Y — part of every run |
| NFR-02 | Small load test | `GET /accounts/{id}`, `POST /transfer` | Non-functional | P2 | Smoke passed | Baseline then higher load per endpoint (up to 10 users, 2 minutes; Stage 5) | Transfers of 1.00 | **Rule (SLA model):** p95 `GET /accounts/{id}` ≤ 1000 ms, p95 `POST /transfer` ≤ 1500 ms, error rate < 1 % (HTTP + body checks) per scenario; balances add up after the run. The baseline run is compared with O7 | N — runs in k6 |

### 5.8 What we automate and why

- **Automated in Postman (42):** smoke, endpoint tests and the journey — every test with a clear expected result. These guard the rules that must never break: money adds up, no negative or overdraft, history matches, login required.
- **Smoke (6):** AUTH-01, CUST-01, ACCT-01, ACCT-02, DEP-01, HIST-01.
- **Minimum set (16, all P1):** the 6 smoke tests plus CUST-03, TRF-01, TRF-02, TRF-03, DEP-03, WDR-01, WDR-03, BILL-01, LOAN-01, JRN-01.
- **Manual (5):** AUTH-03 (design issue), AUTH-05 (blocked by the firewall), TRF-08 (exploratory), TRF-09 (breaks accounts), NFR-02 (runs in k6).
- **Bonus code tests:** TRF-01, TRF-03, DEP-01, ACCT-03, JRN-01.

### 5.9 Already seen failing during exploration — with evidence

**Status:** what the Stage 1 exploration saw, before any test case ran. Each finding was then re-run by its test case (Stage 3) and reproduced on a fresh user next to a control (Stage 4); the confirmed defects are in `Bug_Reports.md`. Most break a *proposed* rule (A#), so their severity also depends on R&D confirming that rule.

The exploration runs on a **throwaway customer** (`qa_s1_…`, customer 15098, accounts A 19671, F 19782, B 19893), never on the shared test users, because several probes are destructive. The 0.005 transfer runs last, since it makes the accounts unreadable. Requests are shown with credentials removed; amounts and balances are copied from `evidence/exploration/observations.json` (run of 2026-11-24, 12:02–12:06 UTC).

| # | Finding | Rule broken | Test | Request | Response | Balances before → after | Time (UTC) | Evidence |
|---|---|---|---|---|---|---|---|---|
| E1 | 0.005 is accepted and both accounts can no longer be read | A5, A8 | TRF-09 | `POST /transfer?fromAccountId=19782&toAccountId=19671&amount=0.005` | 200 "Successfully transferred $0.005…" | 19782: −299,895.00 → **500 error** · 19671: 101,276.50 → **500 error** | 12:06:38 | probe E-TRF7 → BUG-001 |
| E2 | Profile including SSN returned to an anonymous caller | A6 | CUST-03 | `GET /customers/15098` — no cookie, no credentials | 200, full Customer incl. SSN | — | 12:04:00 | probe E-AUTH5 → BUG-002 |
| E3 | Negative transfer moves money the other way | A3 | TRF-03 | `POST /transfer?fromAccountId=19782&toAccountId=19671&amount=-1` | 200 "Successfully transferred $-1…" | 19782: 100.00 → **101.00** · 19671: 277.50 → **276.50** | 12:04:28 | probe E-TRF2 → BUG-003 |
| E4 | Transfer above the balance accepted | A4 | TRF-02 | `POST /transfer?fromAccountId=19782&toAccountId=19671&amount=100000` | 200 "Successfully transferred $100000…" | 19782: 101.00 → **−99,899.00** · 19671: 276.50 → 100,276.50 | 12:04:37 | probe E-TRF3 → BUG-004 |
| E5 | Withdrawal above the balance accepted | A4 | WDR-02 | `POST /withdraw?accountId=19782&amount=100000` | 200 "Successfully withdrew $100000…" | 19782: −99,904.00 → **−199,904.00** | 12:05:22 | probe E-WDR1 → BUG-004 |
| E6 | Bill payment above the balance accepted | A4 | BILL-02 | `POST /billpay?accountId=19782&amount=100000` (full payee) | 200 `{"payeeName":"City Utilities","amount":100000,…}` | 19782: −199,899.00 → **−299,899.00** | 12:05:41 | probe E-BIL1 → BUG-004 |
| E7 | Negative deposit takes money out | A3 | DEP-03 | `POST /deposit?accountId=19782&amount=-5` | 200 "Successfully deposited $-5…" | 19782: −99,899.00 → **−99,904.00** | 12:05:15 | probe E-DEP2 → BUG-003 |
| E8 | Negative withdrawal adds money | A3 | WDR-03 | `POST /withdraw?accountId=19782&amount=-5` | 200 "Successfully withdrew $-5…" | 19782: −199,904.00 → **−199,899.00** | 12:05:27 | probe E-WDR2 → BUG-003 |
| E9 | Negative bill payment adds money | A3 | BILL-04 | `POST /billpay?accountId=19782&amount=-5` | 200 `{"amount":-5,…}` | 19782: −299,900.00 → **−299,895.00** | 12:05:54 | probe E-BIL3 → BUG-003 |
| E10 | Zero amounts accepted | A3 | TRF-04, DEP-02, WDR-04 | `POST /deposit?accountId=19782&amount=0` (also transfer 0, withdraw 0) | 200 "Successfully deposited $0…" | 19782 unchanged; the suites show the 0.00 rows recorded | 12:05:10 | probe E-DEP1 → BUG-010 |
| E11 | Transfer to the same account accepted | A10 | TRF-05 | `POST /transfer?fromAccountId=19782&toAccountId=19782&amount=1` | 200 "Successfully transferred $1…" | 19782 unchanged | 12:04:42 | probe E-TRF4 → BUG-011 |
| E12 | Empty payee accepted | A11 | BILL-03 | `POST /billpay?accountId=19782&amount=1`, body `{}` | 200 `{"payeeName":null,"amount":1,…}` | 19782: −299,899.00 → −299,900.00 | 12:05:46 | probe E-BIL2 → BUG-007 |
| E13 | Missing amount or `CREDIT` filter gives a server error | C1, A8 | TRF-07, HIST-04 | `POST /transfer?fromAccountId=19782&toAccountId=19671` · `GET /accounts/19671/transactions/month/November/type/CREDIT` | 500 HTML error page (both) | unchanged | 12:04:56 · 12:03:14 | probes E-TRF6, J12g → BUG-012, BUG-013 |
| E14 | Approved loan: loan account holds 500.00; the history shows no loan entry | A12 (proposed) | LOAN-01, JRN-01 J13e | `POST /requestLoan?customerId=15098&amount=500&downPayment=50&fromAccountId=19671` | 200 `approved: true`, loan account 20004 | 19671: 335.50 → 285.50; loan account 20004 = 500.00 | 12:03:25 | probes J13, J13b; the empty loan history is shown by LOAN-01 and the UI cross-check (<!-- auto:ui-shot:L -->[`results/kept/2026-11-24T11-21-47Z-ui/screenshots/activity-L-28329.png`](../results/kept/2026-11-24T11-21-47Z-ui/screenshots/activity-L-28329.png)<!-- /auto:ui-shot:L -->) → BUG-006 |
| E15 | New-account response shows a different balance than the account | A7 | JRN-01 (J06) | `POST /createAccount?customerId=15098&newAccountType=1&fromAccountId=19671` | 200 `{"id":19893,…,"balance":0}`; `GET /accounts/19893` → 100.00 | 19671: 415.50 → 315.50 | 12:02:27 | probes J06, J06b → BUG-009 |
| E16 | Selling more shares than owned is accepted and credits money | A4, A1 | — (extended; no suite case) | `POST /customers/15098/sellPosition?accountId=19671&positionId=13017&shares=100&pricePerShare=10` (position holds 1 share) | 200, position `"shares":-99` | 19671: 100,276.50 → **101,276.50** | 12:06:22 | probe E-INV1 → BUG-017 |

All evidence files are in `evidence/exploration/`: `observations.md` lists every probe in one table, `observations.json` holds the full requests and responses with passwords and SSNs removed, and `latency-baseline.md` has the unloaded response times (O7).

## 6. Open questions for the product/R&D team

Each one asks R&D to confirm a **proposed rule** (A#), explain an **observation** (O#), or settle an **Open** expected result.

1. Is any overdraft allowed? If so, how much? *(A4)*
2. Are zero or negative amounts ever valid? *(A3)*
3. How many decimals can an amount have? *(A5)*
4. Which error codes should the API return (the contract lists none)? *(A8, Open status codes)*
5. Should a transfer to the same account be blocked? *(A10)*
6. Which values does the transaction type filter accept? *(O2)*
7. Which date format and timezone do the filters and `Transaction.date` use? *(O2, C1)*
8. Should transaction dates be `date-time` strings (Swagger) or numbers (API)? *(C1)*
9. What decides loan approval? How should an approved loan show up — loan account balance, money paid to the customer, transaction entries? *(A12, O4)*
10. Is the API meant to require a login? *(A6)*
11. Which bill-pay payee fields are required? *(A11)*
12. What is the opening amount for new accounts (it changed from 100.00 to 200.00 between runs), who configures it, and should the create response show it? *(O1)*
13. Should sending the same transfer twice be blocked? *(TRF-08)*
14. May we use our two own users to test whether one customer can reach the other's accounts? *(A6)*
15. Are the proposed response-time targets (reads p95 ≤ 1 s, writes p95 ≤ 1.5 s) acceptable, or are there official SLAs? *(SLA model)*
