# API test results — run 2026-11-24T10-25-10Z-api

Phases run: smoke → suites → journey · smoke gate: passed · requests: 151

| Verdict | Cases |
|---|---|
| PASS | 19 |
| FAIL | 21 |
| NEEDS-CLARIFICATION | 1 |
| BLOCKED | 0 |
| NOT RUN | 5 |

Checks = passed / total assertions for the case. Basis: [C#] contract → defect; [A#] proposed rule → candidate defect (needs R&D confirmation, STD §6).

| ID | Title | Priority | Verdict | Checks | Notes |
|---|---|---|---|---|---|
| AUTH-01 | Valid login | P1 | **PASS** | 3/3 |  |
| AUTH-02 | Wrong password | P2 | **PASS** | 2/2 | recorded: [Open] status code |
| AUTH-03 | Password sent in the URL | P2 | **NOT RUN** | — | Manual: design issue, noted once |
| AUTH-04 | Unknown user | P2 | **PASS** | 2/2 |  |
| AUTH-05 | Injection in username | P3 | **NOT RUN** | — | Manual: the site firewall blocks it first |
| CUST-01 | View own profile | P1 | **PASS** | 3/3 |  |
| CUST-02 | Customer that doesn't exist | P2 | **PASS** | 3/3 | recorded: [Open] status code |
| CUST-03 | Profile without logging in | P1 | **FAIL** | 0/2 | candidate defect [A6]; [A6] rejected with 401 or 403 (got 200); [A6] no SSN in the response |
| ACCT-01 | List own accounts | P1 | **PASS** | 4/4 |  |
| ACCT-02 | Account details match | P1 | **PASS** | 3/3 |  |
| ACCT-03 | Account that doesn't exist | P2 | **PASS** | 6/6 | recorded: [Open] status code; recorded: [Open] status code |
| ACCT-04 | Account without logging in | P1 | **FAIL** | 0/2 | candidate defect [A6]; [A6] rejected with 401 or 403 (got 200); [A6] no balance data returned |
| ACCT-05 | Account ID that isn't a number | P3 | **PASS** | 2/2 |  |
| TRF-01 | Valid transfer | P1 | **PASS** | 9/9 |  |
| TRF-02 | More than the balance | P1 | **FAIL** | 1/4 | candidate defect [A4]; [A4] rejected with 4xx (got 200); [A4] account 16008 balance unchanged (0 -> -100000 cents); [A4] account 16119 balance unchanged (40000 -> 140000 cents) |
| TRF-03 | Negative amount | P1 | **FAIL** | 1/4 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 16008 balance unchanged (-100000 -> -99900 cents); [A3] account 16119 balance unchanged (140000 -> 139900 cents) |
| TRF-04 | Zero amount | P2 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] no 0.00 transaction created (found 1) |
| TRF-05 | Same account | P2 | **FAIL** | 2/3 | candidate defect [A10]; [A10] rejected with 4xx (got 200) |
| TRF-06 | Account that doesn't exist | P2 | **PASS** | 4/4 | recorded: [Open] status code |
| TRF-07 | Missing amount | P2 | **FAIL** | 3/5 | defect [C1] [A8]; [C1] rejected with 4xx (got 500); [A8] no server error (got 500) |
| TRF-08 | Same transfer sent twice | P3 | **NOT RUN** | — | Manual: exploratory |
| TRF-09 | Amount below one cent | P1 | **NOT RUN** | — | Manual: breaks accounts (reproduced in Stage 1, E1) |
| TRF-10 | Exact balance | P2 | **PASS** | 4/4 |  |
| DEP-01 | Valid deposit | P1 | **PASS** | 4/4 |  |
| DEP-02 | Zero deposit | P2 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] no 0.00 transaction created (found 1) |
| DEP-03 | Negative deposit | P1 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 16341 balance unchanged (20000 -> 19500 cents) |
| WDR-01 | Valid withdrawal | P1 | **PASS** | 5/5 |  |
| WDR-02 | More than the balance | P1 | **FAIL** | 1/3 | candidate defect [A4]; [A4] rejected with 4xx (got 200); [A4] account 16563 balance unchanged (19500 -> -100000 cents) |
| WDR-03 | Negative withdrawal | P1 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 16563 balance unchanged (-100000 -> -99500 cents) |
| WDR-04 | Zero withdrawal | P2 | **FAIL** | 2/4 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] no 0.00 transaction created (found 1) |
| BILL-01 | Valid bill payment | P1 | **PASS** | 7/7 |  |
| BILL-02 | More than the balance | P2 | **FAIL** | 1/3 | candidate defect [A4]; [A4] rejected with 4xx (got 200); [A4] account 17229 balance unchanged (19500 -> -100000 cents) |
| BILL-03 | No payee details | P2 | **FAIL** | 2/4 | candidate defect [A11]; [A11] rejected with 4xx (got 200); [A11] account 17229 balance unchanged (-100000 -> -100100 cents) |
| BILL-04 | Negative bill | P1 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 17229 balance unchanged (-100100 -> -99600 cents) |
| LOAN-01 | Loan result matches the accounts | P1 | **FAIL** | 9/11 | defect [C1] [A12]; [C1] loanResponse schema (data.responseDate should be string); [A12] the loan is recorded in the loan account history (found 0) |
| LOAN-02 | Negative loan | P2 | **PASS** | 4/4 |  |
| LOAN-03 | Down payment larger than the loan | P2 | **NEEDS-CLARIFICATION** | 2/2 | recorded: [Open] behavior; recorded: [Open] S change (cents) |
| LOAN-04 | Down payment larger than the balance | P2 | **FAIL** | 1/4 | candidate defect [A4]; [A4] denied (got 200, approved true); [A4] account 17562 balance unchanged (13000 -> -100000 cents); [A4] no loan account opened |
| HIST-01 | History shows a deposit | P1 | **FAIL** | 6/7 | defect [C1]; [C1] Transaction.date is a date-time string (got number) |
| HIST-02 | Filter by amount | P2 | **PASS** | 2/2 |  |
| HIST-03 | Filter by date | P2 | **PASS** | 5/5 |  |
| HIST-04 | Filter by month and type | P2 | **FAIL** | 8/10 | candidate defect [A8]; [A8] no server error (got 500); [A8] rejected with 4xx (got 500) |
| HIST-05 | Wrong date format | P3 | **FAIL** | 2/3 | candidate defect [A8]; [A8] rejected with 4xx (got 200) |
| HIST-06 | One transaction by ID | P3 | **PASS** | 2/2 |  |
| JRN-01 | Customer lifecycle journey | P1 | **FAIL** | 91/94 | defect [A7] [C1] [A12]; J06b [A7] create response balance = account balance (0 vs 20000 cents); J13a [C1] loanResponse schema (data.responseDate should be string); J13e [A12] the loan is recorded in the loan account history (found 0); observation changed: J06b [O1] new account funded with 100.00 |
| NFR-02 | Small load test | P2 | **NOT RUN** | — | Stage 5 (k6) |

## NFR-01 — response times in this run (SLA model, STD §4)

All requests: n 151, p50 243 ms, p95 337 ms, max 733 ms. Timeouts (> 5 s) or no response: **0** → NFR-01 **PASS** (no p95 verdict where n < 20).

| Endpoint | Class | n | p50 | p95 | max | p95 target | Over target | Verdict |
|---|---|---|---|---|---|---|---|---|
| `GET /accounts/{id}` | Read | 17 | 243 | 315 | 315 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions` | Read | 17 | 235 | 284 | 284 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/amount/{x}` | Read | 2 | 256 | 265 | 265 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/fromDate/{f}/toDate/{t}` | Read | 2 | 271 | 302 | 302 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/month/{m}/type/{t}` | Read | 6 | 238 | 306 | 306 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/onDate/{x}` | Read | 4 | 235 | 348 | 348 | 1000 | 0 | info (n < 20) |
| `GET /customers/{id}` | Read | 6 | 228 | 337 | 337 | 1000 | 0 | info (n < 20) |
| `GET /customers/{id}/accounts` | Read | 33 | 241 | 361 | 624 | 1000 | 0 | PASS |
| `GET /customers/{id}/positions` | Read | 1 | 306 | 306 | 306 | 1000 | 0 | info (n < 20) |
| `GET /login/{u}/{p}` | Read | 6 | 290 | 733 | 733 | 1000 | 0 | info (n < 20) |
| `GET /positions/{id}` | Read | 2 | 222 | 266 | 266 | 1000 | 0 | info (n < 20) |
| `GET /transactions/{id}` | Read | 2 | 235 | 315 | 315 | 1000 | 0 | info (n < 20) |
| `POST /billpay` | Write | 5 | 236 | 271 | 271 | 1500 | 0 | info (n < 20) |
| `POST /createAccount` | Write | 9 | 245 | 330 | 330 | 1500 | 0 | info (n < 20) |
| `POST /customers/update/{id}` | Write | 2 | 221 | 226 | 226 | 1500 | 0 | info (n < 20) |
| `POST /customers/{id}/buyPosition` | Write | 1 | 254 | 254 | 254 | 1500 | 0 | info (n < 20) |
| `POST /customers/{id}/sellPosition` | Write | 1 | 236 | 236 | 236 | 1500 | 0 | info (n < 20) |
| `POST /deposit` | Write | 15 | 238 | 322 | 322 | 1500 | 0 | info (n < 20) |
| `POST /requestLoan` | Write | 5 | 259 | 341 | 341 | 1500 | 0 | info (n < 20) |
| `POST /transfer` | Write | 9 | 283 | 305 | 305 | 1500 | 0 | info (n < 20) |
| `POST /withdraw` | Write | 6 | 233 | 315 | 315 | 1500 | 0 | info (n < 20) |
