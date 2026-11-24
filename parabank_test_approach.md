# ParaBank API — Interview Take-Home Test Approach & Execution Plan

**Author:** Roy Kazes  
**Date:** 2026-11-23  
**Status:** Proposal based on supplied exercise and OpenAPI file; **no API tests have been executed and no actual defects are claimed**.  
**Primary sources:** `docs/exercise/01_Exercise_Instructions.md` and `docs/exercise/02_parabank_openapi.json` (OpenAPI 3.0.1, API version 3.0.0).  
**Audience:** R&D and a QA hiring panel.

## 1. Objective and review standard

Deliver a **defensible release recommendation** for the specified banking API using approximately 3–4 hours of effort. Satisfy every **mandatory** artifact before investing in optional automation. A high-quality result proves financial correctness, meaningful negative behavior, evidence quality, and justified risk treatment rather than reporting a large number of superficial green checks.

**Mandatory output:** Test Design Document (STD) with >=25 prioritized cases, a runnable exported Postman collection/environment covering >=12 cases, Jira-style defects and an ambiguity register, two small performance scenarios per specified endpoint, and a 1–2-page Test Summary Report (STR) with go/no-go recommendation. Optional: 3–5 cases in code with README.

**Non-negotiable safety:** The target is shared and reset periodically. Test ONLY accounts created by the candidate; never exercise another user's data. NEVER call `/cleanDB`, `/initializeDB`, `/setParameter/{name}/{value}`, `/startupJmsListener`, or `/shutdownJmsListener`. Never perform intrusive security scans or sizable load. No parallel writes during the functional suite. Do not interpret a public demo server's behavior as an approved banking specification.

## 2. Scope, tools and exclusions

**In scope:** Login; get customer; list customer accounts; get account; list and filter transactions; transfer; deposit; withdraw; billpay; requestLoan. Relevant transaction filters in supplied spec: by amount, month+type, from/to date, and onDate.

**Out of test scope:** Positions, customer update, account creation as a feature, any database/JMS/admin routes; web UI is used only for candidate-owned user/account provisioning and independent cross-checks. Account creation through the UI is **setup**, not an additional API under test. Closed accounts cannot be exercised unless there is a safe documented setup path.

**Lean recommended stack:**

- **Postman:** primary execution tool, variables, assertions, request dependencies, collection folders and export. Use Postman CLI or Newman for repeatable terminal runs (one runner, not both).
- **Claude Code:** read the spec, draft the risk register/STD, prepare the collection and scripts, perform review/triage, and help write STR. It **must not invent expected rules, fabricate test results, or autonomously invoke live mutating/admin operations**.
- **k6:** standalone, conservative performance scripts and raw result export for `GET /accounts/{accountId}` and `POST /transfer`.
- **Web UI:** register and provision candidate-owned accounts and cross-check balances / transactions.
- **Markdown:** STD, assumption ledger, defect tickets, STR and reproducible README. No dashboard, agent swarm, elaborate CI, coverage plug-in, database access, or large contract-fuzzing run is needed for this assignment.

**Why not lead with Playwright / Schemathesis?** The exercise explicitly requires an exported collection or equivalent and has an aggressive timebox. Postman is the lowest-friction way to demonstrate request/response details and hand over runnable tests. Schema-guided generation can create too much shared-system traffic and low-value, unsupported expectations.

## 3. Contract facts vs unknown business rules

Facts **visible in the supplied OpenAPI**:

- The base server path is `/parabank/services/bank` and the exercise gives the host `https://parabank.parasoft.com`.
- `GET /login/{username}/{password}` exposes username and password in the **URL path**; the API returns a Customer-like shape. There is no declared bearer-token security scheme or global `security` requirement in the OpenAPI. **Discover actual cookie/session behavior empirically; do not invent JWT handling.**
- `POST /transfer` accepts `fromAccountId`, `toAccountId`, `amount` as **query parameters**, despite being POST. `POST /deposit` and `/withdraw` likewise use query parameters.
- `POST /billpay` accepts `accountId` and `amount` in query and a required `Payee` JSON or XML body. The `Payee` schema fields themselves do not declare `required` keys.
- `POST /requestLoan` accepts `customerId`, `amount`, `downPayment`, `fromAccountId` as query and returns `LoanResponse` (`loanProviderName` is the only explicitly required property).
- The OpenAPI generally documents a `default` response rather than success/error status codes. Its schema properties are mostly optional. Therefore **schema validity alone cannot establish correctness**.
- A filter expects upper-case `CREDIT`/`DEBIT`, while `Transaction.type` schema enums are `Credit`/`Debit`. This is an apparent terminology/case discrepancy to **investigate**, not a confirmed defect.
- Filter date parameters are generic `string` with no explicit date format; discover expected formatting using the UI/API and record it.

**Business rules to validate, not assume as fact:** A transfer must conserve total funds across two candidate-owned accounts; deposited money should increase the balance exactly once; withdrawals and bill payments should debit correctly; negative/zero amounts and insufficient funds should be rejected **without changing persisted state**; invalid IDs should not expose data; denied loans should not silently create obligations. Exact HTTP error codes, overdraft policy, loan approval criteria and session enforcement are **not specified**.

**Rule confidence ledger:**

| Code | Source of expected outcome | How to treat mismatch |
|---|---|---|
| `C` | Explicit OpenAPI contract: param types, declared response structures, etc. | Contract discrepancy, with exact evidence |
| `UI` | Confirmed by documented UI workflow / cross-check | API-vs-UI discrepancy, pending intentional-design review |
| `B` | Proposed banking invariant (e.g., conserved transfer funds) | High-priority candidate defect; verify before reporting as confirmed |
| `U` | Unspecified/ambiguous behavior | `NEEDS_SPEC`; do not silently turn observations into a passing oracle |

**Important:** Do not automatically call a status `200` a success; a response may contain an error. Also do not automatically call a non-`4xx` negative case a confirmed bug before observing response semantics and state. Any unexpected state change involving money is more important than status alone.

## 4. Risk-prioritized execution strategy

Use simple, explainable scoring: **Business impact (1–5) × likelihood (1–3) = 1–15**. Impact 5 covers money corruption, accidental duplicate charges, or material data exposure. Mark `P0` for score >=10 or any material financial/security invariant; `P1` for 5–9; `P2` otherwise. Record the score and why. This is a *selection tool*, not an excuse to defer serious risks.

**Execution sequence:**

1. **Setup/health:** One candidate-created user; two candidate-owned accounts (create second via UI if necessary); sufficient disposable test balance; capture baseline IDs, balances and timestamp. Use unique run ID and keep credentials local only.
2. **P0 read-only smoke:** Login, own customer/account, account list, baseline balance, transaction list. If setup or access fails, block dependent writes; do not produce misleading fails.
3. **P0 money movement:** One successful transfer, then controlled insufficient-funds and negative/zero cases. Use **before → action → after** checks for both balances and transaction entries.
4. **P0/P1 money endpoints:** Small deposit/withdraw/billpay; verify exact state effects and one matching transaction/charge where observable; loan response and account consequences, without assuming approval.
5. **P1 filters/errors:** Filter consistency with a known transaction, invalid identifiers and missing parameters; security checks **only against own assets** and without aggressive enumeration.
6. **Performance:** Only after functional confidence and budget guards are satisfied; run GET and tiny transfer scenarios separately. If a financial P0 defect appears, stop mutating/load tests, preserve evidence and prioritize the STR.
7. **Reporting:** Export collection, redacted environment, run results, defects/ambiguities, load measurements and a traceable go/no-go recommendation.

**Test dependencies:** Create fresh baseline snapshots for each financial test. Track delta rather than assuming initial balances. Avoid a chain where one test's failure poisons the next: independent setup/readback per scenario, skip with `BLOCKED` when prerequisites are not valid. No shared DB reset; no reliance on data surviving overnight.

## 5. Prioritized test design inventory (35 distinct scenarios)

**Legend:** `A` = planned for the minimum >=12 executable Postman cases; `M` = designed / manual or stretch. `C`, `UI`, `B`, `U` are oracle confidence codes from section 3. The table gives **proposed** expected behavior, not verified production facts. *Do not claim these tests passed before running them.*

| ID | P | Feature | Scenario / failure mode | Expected check / oracle | Plan |
|---|---|---|---|---|---|
| AUTH-01 | P0 | Login | Candidate-owned valid credentials | Customer ID matches candidate-owned profile; stable returned identity (`UI/C`) | A |
| AUTH-02 | P1 | Login | Wrong password | Does not authenticate/return a valid customer identity (`B/U`); status per discovery | A |
| AUTH-03 | P1 | Login | Credentials sent in URL | Confirm URL is used; record exposure risk and redaction (design observation, not exploit) | M |
| CUST-01 | P0 | Customer | Read own customer | Returned `id` and profile match created user (`UI/C`) | A |
| CUST-02 | P1 | Customer | Invalid `customerId=-1` | No unrelated customer returned (`B`) | M |
| CUST-03 | P1 | Customer | Read own customer without established session | Establish actual session/auth contract; classify `U`, not assume `401` | M |
| ACCT-01 | P0 | Accounts | List own customer accounts | All returned account owners = own customer ID; includes provisioned accounts (`UI/C`) | A |
| ACCT-02 | P0 | Accounts | Fetch own account | Account/customer IDs and current balance match independent read/UI (`UI/C`) | A |
| ACCT-03 | P1 | Accounts | Invalid `accountId=-1` | Does not return a valid account or another person's data (`B`) | A |
| ACCT-04 | P1 | Accounts | Read own account without established session | Discover exposure and authentication expectations (`U`); no foreign IDs | M |
| TRF-01 | P0 | Transfer | Valid `A→B` small amount | Source decreases by X, target increases by X, `A+B` conserved; ledger reflects exactly one transfer (`B`) | A |
| TRF-02 | P0 | Transfer | Amount greater than source balance | No unintended debit/credit; response explains outcome; overdraft rule `NEEDS_SPEC` (`B/U`) | A |
| TRF-03 | P0 | Transfer | Negative amount | No balances/ledger changed; no reverse transfer (`B`) | A |
| TRF-04 | P1 | Transfer | Zero amount | No money or ledger side effects; response classification `NEEDS_SPEC` (`B/U`) | M |
| TRF-05 | P1 | Transfer | Same source and target | No inconsistent balance or spurious entries; policy `NEEDS_SPEC` (`B/U`) | M |
| TRF-06 | P1 | Transfer | Invalid target account `-1` | No valid account altered, no source debit (`B`) | M |
| TRF-07 | P1 | Transfer | Missing required `amount` | Safe rejection/no state change; exact HTTP code `NEEDS_SPEC` (`C/B`) | M |
| TRF-08 | P2 | Transfer | Deliberate retry of identical valid request | **Exploratory only:** idempotency not promised; assess duplicate-payment risk, do not mark as bug by default (`U`) | M |
| DEP-01 | P0 | Deposit | Valid small deposit | Exact X credit on owned account; reflected in balance and ledger (`B`) | A |
| DEP-02 | P1 | Deposit | Zero amount | No balance change or improper transaction (`B/U`) | M |
| DEP-03 | P1 | Deposit | Negative amount | No debit via negative deposit (`B`) | M |
| WDR-01 | P0 | Withdraw | Valid small withdrawal | Exact X debit and matching transaction (`B`) | A |
| WDR-02 | P0 | Withdraw | Exceeds available funds | No unintended state change; overdraft rule `NEEDS_SPEC` (`B/U`) | M |
| WDR-03 | P1 | Withdraw | Negative amount | No credit via negative withdraw (`B`) | M |
| WDR-04 | P1 | Withdraw | Zero amount | No spurious state change (`B/U`) | M |
| BILL-01 | P0 | Bill pay | Valid candidate-owned payee bill payment | Correct owned source debit once; correct amount and payee result; transaction trace (`B/C`) | A |
| BILL-02 | P1 | Bill pay | Bill amount exceeds available funds | No unintended debit; overdraft policy needs confirmation (`B/U`) | M |
| BILL-03 | P1 | Bill pay | Missing payee field | Investigate validation/required fields; Payee schema lacks required-key list (`C/U`) | M |
| LOAN-01 | P0 | Loan | Valid loan request | `LoanResponse` structure; approved/denied is consistent with visible state; **do not pre-assume approval** (`C/B/U`) | A |
| LOAN-02 | P1 | Loan | Negative requested amount | Does not create a loan obligation; response rule `NEEDS_SPEC` (`B/U`) | M |
| LOAN-03 | P1 | Loan | Down payment greater than requested amount | No invalid loan obligation; policy `NEEDS_SPEC` (`B/U`) | M |
| HIST-01 | P0 | Transactions | Read after known successful money movement | Own-account transaction list includes correct matching entry/amount/side (`B/C`) | A |
| HIST-02 | P1 | Transactions | Filter by known transaction amount | Returned rows match requested amount; relevant created transaction found (`C/B`) | M |
| HIST-03 | P1 | Transactions | Filter by date range / single date | Returned dates within requested bounds, timezone/format documented (`C/U`) | M |
| HIST-04 | P1 | Transactions | Month and type filter | Returned types/month match filter; investigate enum case `Credit/Debit` vs `CREDIT/DEBIT` (`C/U`) | M |

**Minimum automated coverage:** 14 `A` cases are marked, allowing 12+ to be completed even if a few become blocked. Prefer finishing the 12 highest-risk cases with strong state assertions over rushing through all 14. If negative cases behave ambiguously, record as `NEEDS_SPEC` rather than silently passing.

**Authorization limitation:** The assignment says to use **your own user and accounts only**. You can test unauthenticated reads of *your own* account to investigate authentication behavior. Do **not** read a foreign or guessed real account. Ask the recruiter whether two separately registered **candidate-owned** identities are permitted before attempting cross-identity/BOLA testing. If not, clearly document that ownership isolation was not established and its risk remains open.

## 6. Postman collection — execution architecture

Recommended single collection (no framework building):

```text
ParaBank QA — Roy Kazes
├── 00 - Setup & Login
│   ├── AUTH-01 Valid login
│   ├── AUTH-02 Invalid password
│   └── CUST-01 Own customer
├── 01 - P0 Smoke (read only)
│   ├── ACCT-01 Own account list
│   ├── ACCT-02 Own account details
│   └── HIST-01 Own transaction baseline / readback
├── 02 - P0 Money flows (sequential)
│   ├── TRF-01 Transfer with before/after reconciliation
│   ├── TRF-02 Insufficient balance — unchanged state
│   ├── TRF-03 Negative amount — unchanged state
│   ├── DEP-01 Valid deposit
│   ├── WDR-01 Valid withdrawal
│   ├── WDR-02 Insufficient balance — unchanged state
│   ├── BILL-01 Bill payment — single debit
│   └── LOAN-01 Loan request — result/state consistency
├── 03 - P1 Invalid / boundary
│   ├── TRF-04 Zero transfer
│   ├── DEP-03 Negative deposit
│   └── ACCT-03 Nonexistent account (-1)
└── 04 - P1 Transaction filters (if time)
    ├── HIST-02 By amount
    ├── HIST-03 Date
    └── HIST-04 Month/type
```

This is a target layout, not a claim that these requests have been created. For every request, use a **stable test ID** and description specifying risk, expected result, and oracle source.

**Environment variables (never commit real secrets):**

```json
{
  "baseUrl": "https://parabank.parasoft.com/parabank/services/bank",
  "username": "<LOCAL_ONLY>",
  "password": "<LOCAL_ONLY>",
  "customerId": "<CAPTURED_FROM_OWN_LOGIN>",
  "sourceAccountId": "<OWN_ACCOUNT_1>",
  "targetAccountId": "<OWN_ACCOUNT_2>",
  "testAmount": "1",
  "runId": "<GENERATE_PER_RUN>"
}
```

Store cookies/session in the runner's cookie mechanism if empirically required. There is **no documented JWT bearer flow** in the supplied spec. Credentials are part of the login URL: keep request logging and evidence **redacted** (also consider query, account IDs, customer profile fields and payee information sensitive), and never commit a filled environment. Provide a sanitized export template so reviewers can enter their own credentials.

**Assertion layers for every executed case:**

1. **Transport:** response status belongs to empirically justified expected class; no timeout and acceptable content type.
2. **Contract:** response shape/type and key fields from relevant OpenAPI schema; account ID, customer ID, numeric balance, etc. **OpenAPI schemas often omit `required`, so add domain checks.**
3. **Business:** exact before/after account delta, conserved funds, amount >0 if valid, relevant transaction ID/type/amount, or no side effects on rejected operation.
4. **Audit:** expected vs actual stored as named assertions; include request method/route (redacted), response, before/after IDs and balances, timestamp, latency, test ID and run ID.

A green status assertion is never sufficient for a financial P0. Do not set Postman variables based on a response that failed prerequisite assertions. If a mutation behaves unexpectedly, stop dependent mutations and preserve state evidence instead of continuing blindly.

**Example TRF-01 expected/actual ledger (ILLUSTRATIVE, not live data):**

| Field | Expected | Actual during run |
|---|---|---|
| Source before | measured `S0` | capture `S0` |
| Target before | measured `T0` | capture `T0` |
| Transfer amount | `1.00` (candidate-owned funds) | request parameter |
| Source after | `S0 - 1.00` | capture `S1` |
| Target after | `T0 + 1.00` | capture `T1` |
| Combined balance | `S0+T0 == S1+T1` | calculate after mutation |
| Ledger | exactly one corresponding debit and credit, if ledger semantics permit | capture matched IDs/counts |
| Verdict | All independent invariants pass | PASS / FAIL / BLOCKED / NEEDS_SPEC |

Use a currency-safe comparison approach (integer minor units or a documented rounding tolerance, because the OpenAPI declares JSON `number` rather than a currency-specific type). Also inspect both accounts via independent GET calls after each action.

## 7. Claude Code — use it as a reviewer and accelerator, not the oracle

**Single-session workflow; no agents required.**

1. **Analyze:** Claude reads instructions and spec, lists only in-scope operations and unknowns; outputs 25+ test IDs with `P`, risk, expected oracle, data setup, selected for automation.
2. **Critique:** Ask Claude to identify duplicates, untestable assumptions, unsafe calls, and where status-only checks would yield false positives.
3. **Implement offline:** Generate Postman v2.1 JSON collection + sanitized environment (or draft request/test scripts to paste). Live calls must be explicitly approved, especially writes.
4. **Review manually:** Confirm each P0 financial assertion checks before/after state. Inspect all URLs for forbidden operations and all logs for secrets.
5. **Execute yourself:** Run smoke first, then financial flows, then invalid cases; export actual results. Claude may analyze redacted evidence and prepare defect reports.
6. **Report:** Claude drafts STR from observed run data only; QA owns severity, spec assumptions and release decision.

**Suggested copy/paste Claude prompt:**

> Read `docs/exercise/01_Exercise_Instructions.md`, `docs/exercise/02_parabank_openapi.json`, and this plan. Do not make any HTTP calls yet. First produce an endpoint-scope inventory, a rule-confidence/ambiguity register and a prioritized 25+ case STD. Choose 12–15 nonredundant cases suitable for Postman, with explicit before/after banking-state assertions. Keep unknown exact HTTP error codes marked NEEDS_SPEC. Do not generate tests for excluded/admin endpoints. Do not access other people's accounts or perform load/security attacks. Never store real credentials or customer data in committed files. Then generate a portable Postman v2.1 collection and a blank environment template. Do not report a bug or pass/fail result without genuine execution evidence. Pause for human approval before any live write request.

**Optional defensive measure:** Add an allowlist in any runner/wrapper that rejects all operations except the specified in-scope ones; block the prohibited endpoints explicitly. A natural-language restriction in `CLAUDE.md` is useful context but not a deterministic security boundary.

## 8. Performance experiment — small, safe and honest

**Endpoints explicitly required:** `GET /accounts/{accountId}` and `POST /transfer`. Use only candidate-owned IDs. Do not load-test login or other routes and do not touch administrative endpoints.

**Example load model** (conservative even though the exercise permits up to ~20 VUs and a few minutes):

| Endpoint | Baseline | Higher scenario | Notes |
|---|---|---|---|
| GET own account | 1 VU × 10 total requests, paced | 3 VUs × 5 requests each, paced | Approx 25 requests total; compare per-run p50/p95, failures |
| POST transfer | 1 VU × 3 transfers of `1.00` | 2 VUs × 3 transfers each of `1.00` | **Only 9 transfers total**, if funded and functional checks pass; verify aggregate balances after |

**Safety guards:** Run sequentially, use sleep between requests, hard-cap all iterations, total transfer amount and 2 VUs, avoid retries on uncertain transfer responses, and stop on business/transport anomalies. Never execute on non-owned accounts. Since concurrent writes can create race conditions and exhaust funds, only run the 2-VU transfer scenario if the team/user considers it acceptable on the shared demo; otherwise do a paced higher-rate sequential scenario and disclose the limitation. No stress, spikes, soak, or attacks.

**Illustrative self-defined thresholds, not requirements:** `GET p95 < 1500 ms`; `POST transfer p95 < 2500 ms`; target zero functional/HTTP errors. A tiny sample gives weak p95 confidence, so provide **raw samples and median/min/max**, and explicitly state that these tests cannot establish scalability, production SLA compliance, or concurrency safety. If the response includes a business error with HTTP 200, count it as a failure using response-body checks as well as HTTP error rate.

**Report:** time, environment, precise workload, response counts, p50/p95, slowest call, transport failures, business failures, balances before and after load, likely bottleneck hypotheses, and limitations. Use separate k6 scenarios or scripts so transfer cannot run accidentally in a read-only job.

## 9. Result visibility, bug reporting and quality gates

Each executed case yields a compact evidence object, report row, or Postman test output:

```text
run_id | UTC_time | environment | test_id | risk | request (redacted) |
preconditions | expected (oracle C/UI/B/U) | actual status |
actual response (redacted) | before_state | after_state |
assertions | duration_ms | PASS/FAIL/BLOCKED/NEEDS_SPEC |
evidence_file | defect_id (if confirmed)
```

**Use four distinct statuses:**

- `PASS`: independently supported expectations satisfied.
- `FAIL`: a defined assertion failed; investigate, classify and attach evidence.
- `BLOCKED`: environment/setup/downstream prerequisites prevent a trustworthy verdict.
- `NEEDS_SPEC`: material expected behavior is not sufficiently defined; observed results are not a legitimate oracle.

**Bug report template (Jira-style):** title, affected endpoint, severity/priority, environment/run ID, preconditions with owned fixtures, exact sanitized request, step-by-step reproduction, independently derived expected result (with source), actual result, before/after balances or returned entities, redacted response, repeatability and impact. Separately maintain ambiguities/contract contradictions. Never label a deliberately induced failure as a real ParaBank bug.

**Likely high-value spec questions:** What are permitted overdrafts? Are zero/negative financial amounts prohibited? Is a loan approval rule published? Do account read operations require session authentication? Are same-account transfers valid? Are repeated transfers idempotent? What date formats/timezones are accepted? Does `CREDIT` mean the same as `Credit`? Which payee fields are mandatory? Which HTTP error statuses are intended?

**Go/no-go model:**

- **NO-GO:** confirmed unauthorized financial mutation/disclosure, conservation violation, unintended money creation/loss, double charging without an agreed rule, or another unresolved critical defect in release scope.
- **CONDITIONAL / NOT ENOUGH EVIDENCE:** unresolved core expected behavior, shared-system instability or blocked financial tests prevents a defensible GO. Clearly state what decision depends on.
- **GO with known risks:** all runnable high-risk tests pass, no open critical/high defects under agreed definitions, evidence is sufficient, and limitations are declared. The demo environment and 3–4-hour scope preclude a blanket production-readiness guarantee.

## 10. Four-hour work plan and delivery structure

| Timebox | Action | Exit evidence |
|---|---|---|
| 0:00–0:20 | Read spec, set prohibited-endpoint list, register candidate-owned user + second account via UI | Own IDs/initial balances, screenshots/notes |
| 0:20–0:50 | Document rule assumptions and the 35-case prioritized STD; select >=12 `A` tests | STD/traceability/ambiguities |
| 0:50–2:05 | Build/run Postman collection, prioritizing P0 read checks and financial reconciliation | >=12 actual test executions, exported collection/environment, redacted evidence |
| 2:05–2:30 | Investigate/reproduce real anomalies; issue Jira-style defect reports; isolate UI/API differences | `defects.md`, `questions.md` |
| 2:30–3:00 | Run short k6 GET and transfer baseline/higher scenarios only if safe | Script, raw metrics, load-data reconciliation |
| 3:00–3:35 | Write 1–2-page STR, risk summary and go/no-go; include blocked/untested cases | STR with real pass/fail counts |
| 3:35–4:00 | Re-run key P0s, sanitize exports, README, verify every required deliverable; optional code only if complete | Reviewer-ready zip/folder |

**Repository to submit:**

```text
parabank-qa-assignment/
├── README.md                  # setup / commands / candidate-owned test data policy
├── plan.md                    # this QA approach
├── 01-STD.md                  # 25+ cases; 35 proposed here; scope and risk
├── 02-business-rules.md       # oracle provenance; ambiguity/question register
├── postman/
│   ├── parabank-qa.postman_collection.json
│   └── parabank.template.postman_environment.json  # blank secrets
├── performance/
│   ├── account-read.k6.js
│   ├── transfer-small.k6.js
│   └── results/               # actual CSV/JSON, scripts and environment metadata
├── evidence/                  # sanitized real executions; run IDs and timestamps
├── 03-defects.md              # confirmed defects, or explicitly 'none confirmed'
└── 04-STR.md                  # 1–2 pages, go/no-go with caveats
```

**Do not overbuild:** No custom HTML dashboard, three separate API frameworks, GitHub CI setup from scratch, automatic DB reset, or 100s of generated test cases. A clean and reproducible Postman submission with credible financial assertions plus a safe load script is much more convincing in this timebox.

## 11. Five-minute interview walkthrough

1. **0:00–0:45 — Risk:** Why financial integrity, privacy and authorization lead the test strategy; explain what was intentionally out of scope.
2. **0:45–1:30 — Contract uncertainty:** Show no declared auth scheme, generic response status and under-specified business rules; explain your source-of-truth ledger.
3. **1:30–2:45 — Evidence:** Run/show one transfer with two before/after balance checks and transaction readback. If a real issue exists, show the reproduction; otherwise show an **explicitly labeled local assertion-failure demonstration** (not a live-system defect).
4. **2:45–3:30 — Negative:** Show rejected/unchanged-state case and why status checks alone would miss a defect.
5. **3:30–4:15 — Performance:** Show small workloads, true metrics and limitations.
6. **4:15–5:00 — Decision:** Present STR, open bugs/ambiguities and defensible go/no-go with evidence.

## 12. Final submission checklist

- [ ] >=25 prioritized documented cases and explicit test assumptions
- [ ] >=12 **actually executed** Postman/equivalent tests with meaningful assertions
- [ ] Exported runnable collection and environment **without real credentials**
- [ ] Confirmed defects with full evidence, plus ambiguities; don't fabricate findings
- [ ] Baseline + higher-load scenario for **both** GET account and POST transfer, limited and safe
- [ ] 1–2-page actual STR showing test counts, risks and GO/NO-GO rationale
- [ ] All prohibited operations absent; only candidate-owned fixtures used
- [ ] Actual run evidence, sanitized secrets and reproducible instructions
- [ ] Optional 3–5 coded tests only after all mandatory work is done

## 13. Reference URLs (public tools; not evidence of execution)

- ParaBank exercise Swagger: https://parabank.parasoft.com/parabank/api-docs/index.html
- ParaBank web UI: https://parabank.parasoft.com/parabank/index.htm
- Postman CLI collection runs: https://learning.postman.com/docs/postman-cli/postman-cli-run-collection
- Postman exports: https://learning.postman.com/docs/getting-started/importing-and-exporting/exporting-data/
- k6 thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- Claude Code project steering: https://claude.com/resources/articles/steering-claude-code-skills-hooks-rules-subagents-and-more
