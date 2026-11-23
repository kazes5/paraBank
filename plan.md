# ParaBank Banking API — QA Exercise Execution Plan

**Source:** `01_Exercise_Instructions.md` (contract: ParaBank OpenAPI)
**System under test:** ParaBank REST API — `https://parabank.parasoft.com/parabank/services/bank`
**Goal:** Decide, with evidence, whether the API is ready for release, and deliver the six artifacts the exercise asks for.

### Test architecture: two layers

| Layer | What it is | Purpose | When it runs |
|---|---|---|---|
| **1. Customer journey (smoke)** | One end-to-end scenario simulating a real customer's lifecycle — onboarding, opening an account, managing money, paying bills, applying for a loan, investing, updating the profile. Every step verifies the data produced by the previous steps. | **Detect**: fast signal that the system works as a whole; a broken data link points at the failing endpoint. | First, at the start of every session and before load tests |
| **2. Endpoint test suites** | One suite per endpoint with its own fresh fixtures: positive, negative, boundary, security and data-integrity cases. | **Isolate and document**: confirm which endpoint is at fault and under which inputs, collect logs and evidence, and give depth of coverage the journey can't. | After the journey; a journey failure triggers the matching suite first |

```
 Journey (detect)                 Endpoint suites (isolate)            Defect (document)
 J01 → J02 → … → Jn  ──FAIL at Jk──▶  suite mapped to Jk (fresh data)  ──▶  bug report + logs
        │                              • positive case reproduces?          + evidence bundle
        └──PASS──▶ run all suites      • which inputs fail?
                   (full regression)   • data or endpoint at fault?
```

---

## 1. Ground rules (apply to every stage)

| # | Rule | How it is enforced |
|---|---|---|
| G1 | Shared public system; data is reset periodically | Journey and suites create their own data each run; nothing is reused across days |
| G2 | Never call `/cleanDB`, `/initializeDB`, `/setParameter`, `/startupJmsListener`, `/shutdownJmsListener` | Not present in any collection/script; collection pre-request guard rejects these URLs; grep check before submission |
| G3 | Load tests small and short | ≤ 20 VUs (plan uses ≤ 10), runs ≤ 2 min, paced requests |
| G4 | No testing of other people's users or accounts | Only IDs created by own runs; invalid IDs limited to obviously non-existent values (`-1`, `0`) |
| G5 | Public site down | Run ParaBank locally (Docker image / WAR) and state it in the STR |
| G6 | Credentials | Login puts the password in the URL path: throwaway password, redacted in exports, logs and evidence |

### Endpoint scope

| Endpoint | Instructions scope | Journey step | Endpoint suite |
|---|---|---|---|
| `GET /login/{username}/{password}` | In scope | J02, J16 | LOG |
| `GET /customers/{customerId}` | In scope | J03, J16 | CUS |
| `GET /customers/{customerId}/accounts` | In scope | J04, J06, J13, J17 | ACC |
| `GET /accounts/{accountId}` | In scope | after every money step | ACC |
| `GET /accounts/{accountId}/transactions` + filters | In scope | J11, J12 | TRX |
| `POST /transfer` | In scope | J09 | TRF |
| `POST /deposit` | In scope | J07 | DEP |
| `POST /withdraw` | In scope | J08 | WDR |
| `POST /billpay` | In scope | J10 | BIL |
| `POST /requestLoan` | In scope | J13 | LON |
| `POST /createAccount` | **Extended** | J06 | OPN |
| `GET /transactions/{transactionId}` | **Extended** | J11 | TRX |
| `buyPosition`, `sellPosition`, `GET /customers/{id}/positions`, `GET /positions/{id}` | **Extended** | J14, J15 | INV |
| `POST /customers/update/{customerId}` | **Extended** | J16 | PRF |

Extended endpoints are included because the journey needs them. Their defects are reported but tagged *extended scope*; the STR keeps the release recommendation for the in-scope API separate. Extended suites are kept small (P2/P3 except their positive case).

**Tools:** Postman (collection + environment), Postman CLI or Newman (command-line runs and JSON reports), k6 (load), Markdown (documents), web UI (registration and cross-checks).

---

## 2. Stage overview

| Stage | Name | Output | Exit gate |
|---|---|---|---|
| 0 | Setup | Registered user, environment file | API login returns own customer |
| 1 | Exploration and business rules | Business-rules ledger, spec questions | Every endpoint called once; rules written down |
| 2 | Test design (STD): journey + endpoint suites | `STD.md` | Journey specified; each in-scope endpoint has a suite; ≥ 25 cases; all 5 types covered |
| 3 | Postman: build and execute both layers | Collection + environment exports, run reports | Journey run; all P1 suite cases run; ≥ 12 cases executed |
| 4 | Failure isolation, log collection, bug reports | `Bug_Reports.md`, evidence bundles, spec ambiguities | Every failure isolated to an endpoint + input and documented |
| 5 | Load and performance | k6 scripts, results, analysis | Baseline + higher run for both endpoints |
| 6 | Test Summary Report (STR) | `STR.md` (1–2 pages) | Go / no-go with justification |
| 7 | Optional automation (bonus) | Coded journey + suite tests + README | Runs with one command |
| 8 | Packaging and submission | One folder / email | Deliverables checklist complete |

Order: 0 → 1 → 2 → 3 sequential. Stage 4 runs alongside Stage 3 (triggered by failures). Stage 5 only after the journey's money steps (J07–J10) and the TRF/ACC suites pass. Stage 7 only after Stages 0–6.

---

## Stage 0 — Setup

1. Register a new user in the web UI (unique username, throwaway password, fake personal data). This is journey step **J01** — the API has no registration endpoint.
2. Log in to the web UI once; note the default account the system created.
3. Through the web UI, open one extra checking account as a **fallback fixture** for the endpoint suites (used if `/createAccount` itself is broken).
4. Create the Postman environment:

   | Variable | Value |
   |---|---|
   | `baseUrl` | `https://parabank.parasoft.com/parabank/services/bank` |
   | `username` / `password` | own credentials (secret, blanked before export) |
   | `firstName`, `lastName`, `street`, `city`, `state`, `zipCode`, `phoneNumber`, `ssn` | registration data (journey checks and profile update) |
   | `fallbackAccountId` | account opened in step 3 |

   All other IDs are captured at run time, never typed in.

**Exit gate:** `GET /login` returns a customer whose name matches the registration.

---

## Stage 1 — Exploration and business rules

**Objective:** no spec exists — derive the rules from Swagger, the web UI and observed behavior. Both layers' assertions are built from these rules.

1. Read the OpenAPI for each endpoint: parameters and their location (path/query/body), schemas, documented status codes.
2. Walk the journey manually once (Swagger UI / Postman), J02 → J17; note status, content type (`Accept: application/json`), response shapes, IDs.
3. Repeat the actions in the web UI (open account, transfer, bill pay, loan, find transactions, update contact info) and compare.
4. Answer the questions both layers depend on:
   - New account opening balance / minimum deposit; is it debited from the funding account?
   - Transactions created per transfer; descriptions and types.
   - Date format for `onDate` / `fromDate` / `toDate`; month format; `CREDIT` vs `Credit` in filters.
   - Loan approval rules; down payment debit; loan account balance.
   - Positions: `shares × price` debited on buy, credited on sell?
   - Profile update: required parameters; effect on login.
   - Is authentication actually required for reads?
   - Error behavior: status codes and body for invalid IDs and missing parameters.
5. Probe edge cases on own accounts only, recording status, body and balances before/after: amount > balance, negative, zero, non-existent account, same source/target, missing parameters.
6. **Business-rules ledger:**

   | ID | Rule / assumption | Source (Swagger / UI / observed / banking norm) | Confidence | Conflict? |
   |---|---|---|---|---|
   | BR-01 | Transfer debits source and credits target by the same amount; total conserved | Banking norm + UI | High | — |
   | BR-02 | Every money movement creates a transaction with matching amount, type and date | Banking norm + UI | High | — |
   | BR-03 | Amounts ≤ 0 are rejected and change no balance | Banking norm | Medium | to confirm |
   | BR-04 | Operations above available balance are rejected (or an overdraft rule is stated) | Banking norm | Medium | to confirm |
   | BR-05 | New account is funded from the source account; source decreases by the opening amount | UI | Medium | to confirm |
   | BR-06 | Approved loan creates an account holding the loan amount; down payment debited | UI | Medium | to confirm |
   | BR-07 | Buying a position debits `shares × price`; selling credits it | Swagger + banking norm | Medium | to confirm |
   | BR-08 | The same entity returns identical data from every endpoint | Consistency norm | High | — |
   | BR-09 | Invalid input returns a 4xx with an error message, never 5xx or data | REST norm | Medium | to confirm |
   | … | … | … | … | … |

7. Every Swagger/UI/API conflict → **spec ambiguities list** (feeds Stage 4).

**Exit gate:** every endpoint exercised; rules ledger complete; every assertion planned in Stage 2 has a rule behind it.

---

## Stage 2 — Test design (STD)

**Objective:** Deliverable 1 — STD with scope, assumptions, risks, approach, ≥ 25 prioritized cases and an automation note.

### 2.1 STD structure
1. **Scope** — endpoint scope table (§1); out of scope: admin endpoints, UI testing, intrusive security scanning, position history.
2. **Assumptions** — link to the business-rules ledger.
3. **Risks** — money created/lost, data inconsistent between endpoints, unauthorized data access, credentials in URL, weak input validation, inconsistent transaction history, shared-environment instability. Rated impact × likelihood.
4. **Test approach** — the two-layer architecture: journey detects, endpoint suites isolate and deepen. Techniques: state verification across endpoints, equivalence classes, boundary values (0, 0.01, balance, balance + 0.01, negative), negative/security probes, API-vs-UI cross-check. Result statuses PASS / FAIL / BLOCKED / NEEDS-CLARIFICATION.
5. **Test cases** — journey (§2.2) and endpoint suites (§2.4).
6. **Failure isolation workflow** (§2.5) and **automation note** (§2.6).

### 2.2 Layer 1 — Customer journey `JRN-01` "Life of a customer"

One scenario, 17 steps in order. Each step names the data it **captures** and the earlier data it **verifies**. Small fixed amounts let the end state be computed in advance.

**Persona:** a new customer who opens a savings account, gets paid, moves money, pays a utility bill, takes a small loan, buys and sells shares, and moves house.

| Step | Phase | Request | Captures | Verifies (data links) |
|---|---|---|---|---|
| J01 | Onboarding | Register in web UI (setup) | username, profile | — |
| J02 | Onboarding | `GET /login/{u}/{p}` | `customerId` | name, address, phone, SSN = registration data |
| J03 | Onboarding | `GET /customers/{customerId}` | — | all fields = J02 response |
| J04 | Onboarding | `GET /customers/{customerId}/accounts` | `accountA`, `A0` | `customerId` on each account = J02; contains the default account |
| J05 | Onboarding | `GET /accounts/{accountA}` | — | id, type, balance, customerId = J04 entry |
| J06 | Open account | `POST /createAccount` SAVINGS funded from A | `accountB`, `B0` | owner = J02; type SAVINGS; A = A0 − B0; list now contains B |
| J07 | Manage money | `POST /deposit` 200.00 → B | — | B = B0 + 200 |
| J08 | Manage money | `POST /withdraw` 20.00 ← B | — | B = B0 + 180 |
| J09 | Manage money | `POST /transfer` 50.00 B → A | — | B −50, A +50; A + B unchanged |
| J10 | Pay bills | `POST /billpay` 30.00 from A, payee "City Utilities" | — | response echoes payee, account, amount; A −30 |
| J11 | Statement | `GET /accounts/{A}/transactions`, `/{B}/transactions`, `GET /transactions/{id}` | `trxTransferIn` | A: funding debit, transfer credit 50, bill debit 30; B: funding credit, deposit 200, withdraw 20, transfer debit 50; dated today; single transaction = its list entry |
| J12 | Statement | Filters on A: amount/50, onDate, fromDate–toDate, month/type | — | amount filter → only the 50 credit; date filters → same set as J11; type filter → only that type |
| J13 | Loan | `POST /requestLoan` 500, down payment 50, from A | `loanAccountId` | approved → new owned account with 500, A −50; denied → no new account, A unchanged, reason given |
| J14 | Invest | `buyPosition` 2 × 10.00 from A, symbol `QATS` | `positionId` | A −20; positions list contains it; `GET /positions/{id}` shares 2, price 10 |
| J15 | Invest | `sellPosition` 1 × 12.00 to A | — | A +12; position shares = 1 |
| J16 | Update profile | `POST /customers/update/{id}` new street + phone | — | customer shows new values, others unchanged; login still works and returns updated profile |
| J17 | Reconciliation | accounts list + each account | — | each balance = expected-state ledger; total = A0 + 592 (loan approved) or A0 + 142 (denied) |

**Expected-state ledger** (collection variables; each money step updates the expected value, then reads the actual one):

| After | Expected A | Expected B | Loan |
|---|---|---|---|
| J04 | A0 | — | — |
| J06 | A0 − B0 | B0 | — |
| J07 | A0 − B0 | B0 + 200 | — |
| J08 | A0 − B0 | B0 + 180 | — |
| J09 | A0 − B0 + 50 | B0 + 130 | — |
| J10 | A0 − B0 + 20 | B0 + 130 | — |
| J13 (approved) | A0 − B0 − 30 | B0 + 130 | 500 |
| J14 | A0 − B0 − 50 | B0 + 130 | 500 |
| J15 | A0 − B0 − 38 | B0 + 130 | 500 |

**Journey verification rules**
- Balances compared in cents (`Math.round(x * 100)`).
- HTTP 200 alone is never success; each step also checks the body.
- Variables set only after the step's assertions pass; downstream steps needing missing data → **BLOCKED**, and the journey continues with the independent steps.
- Every failed step logs a **failure signal**: step, endpoint, mapped suite, expected vs. actual (see §2.5).

### 2.3 Journey as smoke suite
- Smoke = the journey run end-to-end (≈ 25 requests, < 1 min). Covers every endpoint and the core data links.
- Runs first in every session, and before load tests.
- **Pass** → run the endpoint suites as full regression.
- **Fail** → run the mapped endpoint suite(s) first to isolate the cause (§2.5).

### 2.4 Layer 2 — Endpoint test suites

Each suite is **self-contained**: it creates or reads its own fixtures (fresh accounts via `/createAccount`, or `fallbackAccountId` if OPN is failing), reads balances before and after, and does not depend on journey state. That independence is what makes isolation possible: if the journey fails at J09 but `TRF` passes on fresh data, the cause is the journey's data/sequence, not the transfer endpoint.

Every money case asserts the **state** (balances, transactions), not only the status code.

**LOG — `GET /login`**

| ID | Case | Type | Pri |
|---|---|---|---|
| LOG-01 | Valid credentials return own customer with correct fields | Positive | P1 |
| LOG-02 | Wrong password rejected, no customer data | Negative | P1 |
| LOG-03 | Unknown user gets same response as wrong password (no enumeration) | Security | P2 |
| LOG-04 | Injection-style username handled safely (no 5xx, no data) | Security | P2 |

**CUS — `GET /customers/{id}`**

| ID | Case | Type | Pri |
|---|---|---|---|
| CUS-01 | Own customer returns correct profile; schema valid | Positive | P1 |
| CUS-02 | Non-existent customer ID → error, no data | Negative | P2 |
| CUS-03 | Read own customer without logging in (is auth enforced?) | Security | P1 |

**ACC — `GET /customers/{id}/accounts`, `GET /accounts/{id}`**

| ID | Case | Type | Pri |
|---|---|---|---|
| ACC-01 | Accounts list: all owned by customer; each entry = `GET /accounts/{id}` | Positive / Data integrity | P1 |
| ACC-02 | Account balance matches web UI | Data integrity | P1 |
| ACC-03 | Non-existent account ID → error | Negative | P2 |
| ACC-04 | Non-numeric account ID → 4xx, not 5xx | Negative | P3 |
| ACC-05 | Read own account without logging in | Security | P1 |

**TRF — `POST /transfer`**

| ID | Case | Type | Pri |
|---|---|---|---|
| TRF-01 | Valid transfer: source −x, target +x, total conserved, one transaction each side | Positive / Data integrity | P1 |
| TRF-02 | Amount > balance → rejected, both balances unchanged | Boundary | P1 |
| TRF-03 | Amount = exact balance → accepted, source = 0 | Boundary | P2 |
| TRF-04 | Negative amount → rejected, balances unchanged | Negative | P1 |
| TRF-05 | Zero amount → rejected, no transaction | Boundary | P2 |
| TRF-06 | Non-existent target → rejected, source unchanged | Negative | P1 |
| TRF-07 | Same source and target | Negative | P2 |
| TRF-08 | Missing amount → 4xx | Negative | P2 |
| TRF-09 | Precision: 0.01 and 3-decimal amount | Boundary | P3 |

**DEP — `POST /deposit`**

| ID | Case | Type | Pri |
|---|---|---|---|
| DEP-01 | Valid deposit: balance + exact amount; credit transaction created | Positive | P1 |
| DEP-02 | Zero deposit rejected, no transaction | Boundary | P2 |
| DEP-03 | Negative deposit rejected (no hidden debit) | Negative | P1 |

**WDR — `POST /withdraw`**

| ID | Case | Type | Pri |
|---|---|---|---|
| WDR-01 | Valid withdrawal: balance − exact amount; debit transaction created | Positive | P1 |
| WDR-02 | Amount > balance rejected, balance unchanged | Boundary | P1 |
| WDR-03 | Negative withdrawal does not credit | Negative | P1 |

**BIL — `POST /billpay`**

| ID | Case | Type | Pri |
|---|---|---|---|
| BIL-01 | Valid bill payment: exact debit; response echoes payee and amount; transaction created | Positive | P1 |
| BIL-02 | Amount > balance rejected | Boundary | P2 |
| BIL-03 | Missing payee fields → validation error | Negative | P2 |
| BIL-04 | Negative amount rejected (no hidden credit) | Negative | P1 |

**LON — `POST /requestLoan`**

| ID | Case | Type | Pri |
|---|---|---|---|
| LON-01 | Valid loan: response consistent with state (approved → new account, down payment debited; denied → nothing created) | Positive / Data integrity | P1 |
| LON-02 | Negative / zero amount rejected, no account created | Negative | P2 |
| LON-03 | Down payment > balance → denied, nothing debited | Boundary | P2 |

**TRX — transactions and filters**

| ID | Case | Type | Pri |
|---|---|---|---|
| TRX-01 | After a known deposit, list contains it with exact amount, type, date | Data integrity | P1 |
| TRX-02 | Filter by amount returns only matching rows | Positive | P2 |
| TRX-03 | Filter by date / date range returns only rows in range | Positive | P2 |
| TRX-04 | Filter by month/type; `CREDIT` vs `Credit` behavior | Positive / Contract | P2 |
| TRX-05 | `GET /transactions/{id}` equals the list entry | Data integrity | P2 |
| TRX-06 | Invalid filter format → 4xx, not 5xx | Negative | P3 |

**Extended suites (kept small)**

| ID | Case | Type | Pri |
|---|---|---|---|
| OPN-01 | Create account: owned by customer, funded from source, source debited | Positive | P2 |
| OPN-02 | Create account from non-existent source → rejected | Negative | P3 |
| INV-01 | Buy then sell: balance moves by shares × price; position updated | Positive | P2 |
| INV-02 | Sell more shares than owned → rejected | Negative | P3 |
| PRF-01 | Update profile: changed fields persisted, others unchanged, login still works | Positive | P2 |
| PRF-02 | Update with missing required field → validation error, profile unchanged | Negative | P3 |

**Totals:** journey 17 checkpoints + 46 endpoint cases = **63 cases** (well above 25).
Coverage: positive ✔, negative ✔, boundary ✔, security/authorization ✔, data integrity ✔ — in both layers.

### 2.5 Failure isolation workflow (journey → endpoint suite → defect)

1. **Signal.** The journey logs the failing step, e.g. `J09 FAIL — transfer: expected A = 1020.00, actual A = 970.00 → suite TRF`.
2. **Map.** Use the step → suite table (§1) to pick the suite. Also run the suite of the *previous* data-producing step (e.g. J09 fails → run TRF and ACC, since balances are read via ACC).
3. **Isolate on fresh data.** Run the suite's positive case (e.g. TRF-01):
   - Fails on fresh data → **endpoint defect**. Run the suite's other cases to find which inputs fail (amount type, boundary, account type).
   - Passes on fresh data → **sequence/state defect** (depends on prior journey actions). Re-run the journey up to the failing step and narrow down which earlier step causes it.
   - Fails intermittently → repeat 3×; record frequency; check site health (possible shared-environment noise).
4. **Rule out the test.** Verify the assertion against the rules ledger and the web UI; if the rule is unclear → NEEDS-CLARIFICATION, not a defect.
5. **Collect logs and evidence** (bundle per failure):
   - Run report: Postman CLI / Newman JSON report of the journey run and the isolating suite run.
   - Per failed request (written by the test script to the console and report): `runId`, test ID, timestamp (UTC), method, URL (credentials redacted), request params/body, status, response headers and body, response time.
   - State: balances before/after, related transaction list.
   - Web UI cross-check: screenshot of the account/transaction page.
   - Reproduction: minimal request sequence that triggers the failure.
6. **Document.** Jira-style bug report (Stage 4) referencing the journey step, the isolating suite case and the evidence bundle.

### 2.6 Automation note
- **Automate:** the whole journey (smoke, repeatable, fast) and all P1 endpoint cases (money validation that must never regress); P2 cases as time allows.
- **Keep manual:** web-UI cross-checks, cross-user authorization (would need another person's data — not allowed), exploratory precision cases, intermittent-failure reproduction.

**Exit gate:** journey and ledger fully specified; every in-scope endpoint has a suite; isolation workflow defined; ≥ 12 cases marked for automation.

---

## Stage 3 — Postman: build and execute

**Objective:** Deliverable 2 — collection with environment variables, authentication handling, assertions on status, schema and business values; ≥ 12 cases.

### 3.1 Collection structure
```
ParaBank QA
├── 00 Smoke — Customer Journey (JRN-01)     J02 … J17 in order
│   ├── Onboarding       J02–J05
│   ├── Open account     J06
│   ├── Manage money     J07–J09
│   ├── Pay bills        J10
│   ├── Statement        J11–J12
│   ├── Loan             J13
│   ├── Invest           J14–J15
│   ├── Update profile   J16
│   └── Reconciliation   J17
├── 10 Suite fixtures                        login → fresh source/target accounts (fallback: fallbackAccountId)
├── 11 LOG   Login
├── 12 CUS   Customer
├── 13 ACC   Accounts
├── 14 TRF   Transfer
├── 15 DEP   Deposit
├── 16 WDR   Withdraw
├── 17 BIL   Bill pay
├── 18 LON   Loan
├── 19 TRX   Transactions & filters
└── 20 EXT   OPN / INV / PRF (extended)
```
Each suite folder can be run alone (`--folder "14 TRF Transfer"`) after `10 Suite fixtures` — this is how a journey failure is isolated.

### 3.2 Build steps
1. Import the OpenAPI file for request skeletons; keep only planned requests.
2. **Authentication:** J02 / fixtures login stores `customerId` and asserts identity; later requests use captured variables only. Record whether a session/cookie is needed.
3. **Data chaining (journey):** each step stores what later steps verify (`accountA`, `accountB`, `trxTransferIn`, `loanAccountId`, `positionId`, expected balances).
4. **Fixtures (suites):** `10 Suite fixtures` creates fresh `srcAccount` / `dstAccount` and funds them by deposit, so suites never depend on journey state.
5. **Assertion layers in every request:**
   - Status code — expected class per rule.
   - Schema — JSON schema from the OpenAPI plus required-field checks.
   - Business values — rules and data links.
6. **Money cases:** after the action, `GET` the affected accounts in the test script (`pm.sendRequest`) and compare with expected values in cents; rejected operations assert balances unchanged.
7. **Logging hook (collection-level test script):** on any failed assertion, `console.log` a structured record — `runId`, test ID, journey step / suite, method, redacted URL, request body, status, response body, response time, balances before/after — so it lands in the CLI/JSON report.
8. Collection-level: response-time check; forbidden-endpoint guard; fresh `runId` per run.
9. Run sequentially — never parallel.

### 3.3 Execution
1. Run `00 Smoke` from the command line (`postman collection run` / `newman run`) with a JSON report.
2. Journey **pass** → run `10` + all suites (P1 first, then P2/P3).
   Journey **fail** → run `10` + the mapped suite(s) first (§2.5), then the rest.
3. Cross-check J09, J10, J13 and TRF-01 in the web UI.
4. Record results per case: PASS / FAIL / BLOCKED / NEEDS-CLARIFICATION.

### 3.4 Export
- Collection (v2.1 JSON).
- Environment with `username` / `password` / `ssn` blanked.

**Exit gate:** journey executed; all P1 suite cases executed; ≥ 12 cases executed; exports saved; results table filled.

---

## Stage 4 — Failure isolation, log collection and bug reports (overlaps Stage 3)

1. For each journey failure, follow the isolation workflow (§2.5) and record the outcome: *endpoint defect* / *sequence defect* / *intermittent* / *test issue* / *needs clarification*.
2. For each endpoint-suite failure: reproduce once more in isolation; confirm inputs that fail vs. pass.
3. Assemble an **evidence bundle** per failure: `evidence/<defect-id>/` — run report extract, request/response logs (redacted), balances before/after, transaction list, UI screenshot, minimal reproduction sequence.
4. Jira-style report per defect:
   - Title (endpoint + behavior)
   - Environment, date/time, `runId`
   - Detected by (journey step) / isolated by (suite case)
   - Preconditions, steps to reproduce
   - Expected vs. actual (with violated rule ID)
   - Severity and priority; in-scope or *extended*
   - Evidence (link to bundle; request/response inline)
5. Severity scale:

   | Severity | Meaning |
   |---|---|
   | Critical | Money created/lost, money data inconsistent between endpoints, another customer's data exposed, auth bypass |
   | High | Invalid financial operation accepted; missing validation on money endpoints |
   | Medium | Wrong status code, contract mismatch, misleading error |
   | Low | Cosmetic, documentation-only |

6. Spec ambiguities list: every Swagger/UI/API conflict and unclear rule as a question for R&D (overdraft policy, error codes, loan approval criteria, date formats, `CREDIT` vs `Credit`, authentication, update-profile required fields).

**Exit gate:** every failure isolated to an endpoint + input (or classified otherwise), with an evidence bundle and a report.

---

## Stage 5 — Load and performance

**Objective:** Deliverable 4 — basic load test of `POST /transfer` and `GET /accounts/{accountId}`.

**SLAs (self-defined)**

| Metric | `GET /accounts/{id}` | `POST /transfer` |
|---|---|---|
| p95 response time | < 1000 ms | < 2000 ms |
| Error rate (HTTP + business) | < 1 % | < 1 % |

**Load model**

| Scenario | VUs | Duration | Pacing | Purpose |
|---|---|---|---|---|
| Baseline — GET | 1 | 1 min | 1 req/s | Reference latency |
| Higher — GET | 10 | 2 min (30 s ramp) | 1 req/s per VU | Moderate concurrency |
| Baseline — transfer | 1 | 1 min | 1 req / 2 s | Reference latency for writes |
| Higher — transfer | 5 | 2 min (30 s ramp) | 1 req / 2 s per VU | Write contention |

Rationale: well below the 20-VU cap; 1.00 transfers between two own accounts; fewer VUs for writes than reads.

**Steps**
1. Run the journey smoke first; use its accounts A and B (or suite fixtures).
2. Two k6 scripts with checks on status **and** body, thresholds = SLAs.
3. Record A + B before; run the four scenarios sequentially; record A + B after — total unchanged and per-account deltas = successful transfers × 1.00.
4. Report per scenario: requests, p50/p95/max, error rate, SLA pass/fail; latency growth baseline → higher; suspected bottlenecks.
5. If errors appear under load, run the TRF/ACC suites afterwards to check whether functional behavior is still correct.
6. Limitations: shared-environment noise, small samples, no capacity limits or production SLAs can be established.

**Exit gate:** 4 runs done, results and analysis written, balances reconciled.

---

## Stage 6 — Test Summary Report

Deliverable 5 — 1–2 pages for R&D and management:
1. Executive summary — recommendation in one sentence.
2. Scope — tested / not tested (in-scope vs. extended).
3. Results — journey outcome (steps passed, where it broke, isolation result) + endpoint suite counts per suite: designed / executed / passed / failed / blocked.
4. Open defects by severity (table, with detecting journey step and isolating case).
5. Non-functional results — SLA outcome per endpoint.
6. Risks and open spec questions.
7. **Go / no-go** with justification:
   - **No-go** if the journey breaks on an in-scope money step that isolates to an endpoint defect, or any Critical defect is open.
   - **Conditional go** if the journey passes and only Medium/Low or extended-scope issues remain.
   - **Go** only if the journey passes, all P1 suite cases pass, and no High/Critical defects remain.
8. Next steps.

---

## Stage 7 — Optional automation

Deliverable 6 (bonus): 4–5 coded tests (e.g. pytest + requests, or Newman over the exported collection), covering both layers:
1. Journey smoke — onboarding through reconciliation (J02–J17) as one test
2. TRF-01 — transfer conserves total balance (fresh fixtures)
3. TRF-04 — negative transfer leaves balances unchanged
4. DEP-01 — deposit increases balance exactly and creates a transaction
5. ACC-03 — non-existent account returns an error

Credentials from environment variables; on failure, write the request/response log to a file; README with prerequisites, setup and one run command.

---

## Stage 8 — Packaging and submission

1. Remove credentials from exports, reports, logs and evidence; search all files for the password and SSN.
2. Search all scripts for forbidden endpoints.
3. Submission folder:
   ```
   submission/
   ├── STD.md
   ├── Bug_Reports.md
   ├── STR.md
   ├── postman/
   │   ├── ParaBank_QA.postman_collection.json
   │   └── ParaBank.postman_environment.json
   ├── reports/            CLI/JSON run reports (redacted)
   ├── evidence/           one folder per defect
   ├── performance/
   │   ├── get_account.k6.js
   │   ├── transfer.k6.js
   │   └── results.md
   └── automation/         (optional)
       └── README.md
   ```
4. Deliverables checklist:
   - [ ] Test Design Document (STD) — journey + endpoint suites + isolation workflow
   - [ ] Postman collection and environment
   - [ ] Bug reports, evidence bundles and spec questions
   - [ ] Load test scripts and results
   - [ ] Test Summary Report (STR)
   - [ ] (Optional) Automation code
5. Send in one email or shared folder; prepare a short walkthrough (journey run → a failure → isolating suite → bug report).

---

## 3. Contingencies

| Situation | Action |
|---|---|
| Public site down or very slow | Retry later; if still down, run the ParaBank Docker image / WAR locally and note it in the STR |
| Data reset mid-run | Re-run journey / fixtures (both create fresh data); mark interrupted results BLOCKED |
| Journey breaks at a step | Mark dependent steps BLOCKED, run the mapped suite on fresh data to isolate (§2.5) |
| `/createAccount` broken (fixtures fail) | Suites use `fallbackAccountId` and the default account |
| Critical money defect found | Stop write/load tests on that flow, collect the evidence bundle, prioritize bug report and STR |
| Loan always denied | Journey and LON-01 follow the denied branch; note in spec questions |
| Intermittent failure | Repeat 3×, record frequency and timing, check site health; report as intermittent with evidence |
| Scope must be reduced | Drop Stage 7, then P3 and extended suite cases, then reduce Stage 5 to baseline + one higher run per endpoint; never drop mandatory deliverables |
