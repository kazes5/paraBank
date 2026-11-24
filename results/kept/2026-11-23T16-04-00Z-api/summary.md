# API test results — run 2026-11-23T16-04-00Z-api

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
| TRF-02 | More than the balance | P1 | **FAIL** | 1/4 | candidate defect [A4]; [A4] rejected with 4xx (got 200); [A4] account 72174 balance unchanged (0 -> -100000 cents); [A4] account 72285 balance unchanged (20000 -> 120000 cents) |
| TRF-03 | Negative amount | P1 | **FAIL** | 1/4 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 72174 balance unchanged (-100000 -> -99900 cents); [A3] account 72285 balance unchanged (120000 -> 119900 cents) |
| TRF-04 | Zero amount | P2 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] no 0.00 transaction created (found 1) |
| TRF-05 | Same account | P2 | **FAIL** | 2/3 | candidate defect [A10]; [A10] rejected with 4xx (got 200) |
| TRF-06 | Account that doesn't exist | P2 | **PASS** | 4/4 | recorded: [Open] status code |
| TRF-07 | Missing amount | P2 | **FAIL** | 3/5 | defect [C1] [A8]; [C1] rejected with 4xx (got 500); [A8] no server error (got 500) |
| TRF-08 | Same transfer sent twice | P3 | **NOT RUN** | — | Manual: exploratory |
| TRF-09 | Amount below one cent | P1 | **NOT RUN** | — | Manual: breaks accounts (reproduced in Stage 1, E1) |
| TRF-10 | Exact balance | P2 | **PASS** | 4/4 |  |
| DEP-01 | Valid deposit | P1 | **PASS** | 4/4 |  |
| DEP-02 | Zero deposit | P2 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] no 0.00 transaction created (found 1) |
| DEP-03 | Negative deposit | P1 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 72507 balance unchanged (10000 -> 9500 cents) |
| WDR-01 | Valid withdrawal | P1 | **PASS** | 5/5 |  |
| WDR-02 | More than the balance | P1 | **FAIL** | 1/3 | candidate defect [A4]; [A4] rejected with 4xx (got 200); [A4] account 72729 balance unchanged (9500 -> -100000 cents) |
| WDR-03 | Negative withdrawal | P1 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 72729 balance unchanged (-100000 -> -99500 cents) |
| WDR-04 | Zero withdrawal | P2 | **FAIL** | 2/4 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] no 0.00 transaction created (found 1) |
| BILL-01 | Valid bill payment | P1 | **PASS** | 7/7 |  |
| BILL-02 | More than the balance | P2 | **FAIL** | 1/3 | candidate defect [A4]; [A4] rejected with 4xx (got 200); [A4] account 73173 balance unchanged (9500 -> -100000 cents) |
| BILL-03 | No payee details | P2 | **FAIL** | 2/4 | candidate defect [A11]; [A11] rejected with 4xx (got 200); [A11] account 73173 balance unchanged (-100000 -> -100100 cents) |
| BILL-04 | Negative bill | P1 | **FAIL** | 1/3 | candidate defect [A3]; [A3] rejected with 4xx (got 200); [A3] account 73173 balance unchanged (-100100 -> -99600 cents) |
| LOAN-01 | Loan result matches the accounts | P1 | **FAIL** | 9/11 | defect [C1] [A12]; [C1] loanResponse schema (data.responseDate should be string); [A12] the loan is recorded in the loan account history (found 0) |
| LOAN-02 | Negative loan | P2 | **PASS** | 4/4 |  |
| LOAN-03 | Down payment larger than the loan | P2 | **NEEDS-CLARIFICATION** | 2/2 | recorded: [Open] behavior; recorded: [Open] S change (cents) |
| LOAN-04 | Down payment larger than the balance | P2 | **FAIL** | 1/4 | candidate defect [A4]; [A4] denied (got 200, approved true); [A4] account 74283 balance unchanged (3000 -> -100000 cents); [A4] no loan account opened |
| HIST-01 | History shows a deposit | P1 | **FAIL** | 6/7 | defect [C1]; [C1] Transaction.date is a date-time string (got number) |
| HIST-02 | Filter by amount | P2 | **PASS** | 2/2 |  |
| HIST-03 | Filter by date | P2 | **PASS** | 5/5 |  |
| HIST-04 | Filter by month and type | P2 | **FAIL** | 8/10 | candidate defect [A8]; [A8] no server error (got 500); [A8] rejected with 4xx (got 500) |
| HIST-05 | Wrong date format | P3 | **FAIL** | 2/3 | candidate defect [A8]; [A8] rejected with 4xx (got 200) |
| HIST-06 | One transaction by ID | P3 | **PASS** | 2/2 |  |
| JRN-01 | Customer lifecycle journey | P1 | **FAIL** | 91/94 | defect [A7] [C1] [A12]; J06b [A7] create response balance = account balance (0 vs 10000 cents); J13a [C1] loanResponse schema (data.responseDate should be string); J13e [A12] the loan is recorded in the loan account history (found 0) |
| NFR-02 | Small load test | P2 | **NOT RUN** | — | Stage 5 (k6) |

## NFR-01 — response times in this run (SLA model, STD §4)

All requests: n 151, p50 234 ms, p95 329 ms, max 785 ms. Timeouts (> 5 s) or no response: **0** → NFR-01 **PASS** (no p95 verdict where n < 20).

| Endpoint | Class | n | p50 | p95 | max | p95 target | Over target | Verdict |
|---|---|---|---|---|---|---|---|---|
| `GET /accounts/{id}` | Read | 17 | 261 | 331 | 331 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions` | Read | 17 | 232 | 300 | 300 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/amount/{x}` | Read | 2 | 221 | 232 | 232 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/fromDate/{f}/toDate/{t}` | Read | 2 | 226 | 227 | 227 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/month/{m}/type/{t}` | Read | 6 | 226 | 232 | 232 | 1000 | 0 | info (n < 20) |
| `GET /accounts/{id}/transactions/onDate/{x}` | Read | 4 | 228 | 301 | 301 | 1000 | 0 | info (n < 20) |
| `GET /customers/{id}` | Read | 6 | 229 | 304 | 304 | 1000 | 0 | info (n < 20) |
| `GET /customers/{id}/accounts` | Read | 33 | 234 | 316 | 331 | 1000 | 0 | PASS |
| `GET /customers/{id}/positions` | Read | 1 | 221 | 221 | 221 | 1000 | 0 | info (n < 20) |
| `GET /login/{u}/{p}` | Read | 6 | 251 | 785 | 785 | 1000 | 0 | info (n < 20) |
| `GET /positions/{id}` | Read | 2 | 219 | 269 | 269 | 1000 | 0 | info (n < 20) |
| `GET /transactions/{id}` | Read | 2 | 261 | 293 | 293 | 1000 | 0 | info (n < 20) |
| `POST /billpay` | Write | 5 | 229 | 316 | 316 | 1500 | 0 | info (n < 20) |
| `POST /createAccount` | Write | 9 | 233 | 293 | 293 | 1500 | 0 | info (n < 20) |
| `POST /customers/update/{id}` | Write | 2 | 220 | 221 | 221 | 1500 | 0 | info (n < 20) |
| `POST /customers/{id}/buyPosition` | Write | 1 | 230 | 230 | 230 | 1500 | 0 | info (n < 20) |
| `POST /customers/{id}/sellPosition` | Write | 1 | 346 | 346 | 346 | 1500 | 0 | info (n < 20) |
| `POST /deposit` | Write | 15 | 228 | 340 | 340 | 1500 | 0 | info (n < 20) |
| `POST /requestLoan` | Write | 5 | 287 | 329 | 329 | 1500 | 0 | info (n < 20) |
| `POST /transfer` | Write | 9 | 240 | 276 | 276 | 1500 | 0 | info (n < 20) |
| `POST /withdraw` | Write | 6 | 233 | 318 | 318 | 1500 | 0 | info (n < 20) |
