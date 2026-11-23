# Stage 1 — Exploration and Business Rules

**System:** ParaBank REST API, `https://parabank.parasoft.com/parabank/services/bank` (public shared instance)
**Date:** 2026-11-23 (runs 12:58–13:12 UTC)
**Users (own, registered in Stage 0):** Rktest2 (customer 17096), Rktest1 (customer 17762)
**Evidence:** `evidence/stage1/observations.json` / `.md` (journey walk + edge probes, Rktest2), `observations-from-E-DEP1.*` (remaining edge probes, Rktest1), `repro-subcent-transfer.log`. Credentials and SSN are redacted.

---

## 1. What the contract (OpenAPI) says — and doesn't

| Topic | OpenAPI | Consequence for testing |
|---|---|---|
| Authentication | No `securitySchemes`, no `security` requirement; login is `GET /login/{username}/{password}` | Credentials travel in the URL path; nothing tells the server who the caller is on later requests |
| Responses | Every operation documents only `default` — no success or error codes | Expected status codes must be derived (REST norms), not read from the spec |
| Required fields | No schema has `required` except `LoanResponse.loanProviderName` | Schema validation alone proves little; business checks are needed |
| Money | `amount` is `number` (no minimum, no precision) | Spec allows 0, negatives and sub-cent amounts; rules must come from banking norms |
| `Transaction.date` | `string`, `format: date-time` | API actually returns epoch milliseconds (number) — see C-02 |
| `Transaction.type` | enum `Credit`, `Debit` | Filter accepts `Credit`/`Debit`/`All`; `CREDIT` crashes the server — see Q-06 |
| Login summary | "Login (john/demo)" | Documentation publishes demo credentials — see C-05 |
| Mutations | `POST` with all inputs as query parameters (except billpay body) | Amounts, IDs and, for profile update, password + SSN end up in URLs and server logs |

## 2. Observed behavior (summary)

### 2.1 Journey walk (Rktest2, account A = 21780) — all steps worked

| Step | Result |
|---|---|
| J02 login / J03 customer | 200; identical profiles, match registration data |
| J04 / J05 accounts | 200; list entry = single-account read |
| J06 open SAVINGS from A | 200; new account 24555. **Response says balance `0`; reading it shows `100.00`**. A debited 100.00 |
| J07 deposit 200 / J08 withdraw 20 | 200 plain-text success; balances exact |
| J09 transfer 50 B→A | 200; B −50, A +50, total conserved |
| J10 billpay 30 from A | 200 JSON echo (payeeName, amount, accountId); A −30. Payee `accountNumber` (own account F) **not** credited |
| J11 transactions | One transaction per movement, correct type/amount; descriptions "Funds Transfer Sent/Received", "Deposit via Web Service", "Withdraw via Web Service", "Bill Payment to <payee>". `date` = epoch ms at midnight (date only) |
| J11c transaction by id | equals list entry |
| J12 filters | `onDate` and `fromDate/toDate` work only with **`MM-dd-yyyy`** (`yyyy-MM-dd` → `200 []`, silently empty). Month accepts name (`November`), number (`11`) and `All`. Type accepts `Credit`, `Debit`, `All`; **`CREDIT` → 500** |
| J13 loan 500 / down 50 | 200 `approved: true`, new LOAN account 24666 with balance 500.00; A −50. **Loan account has no transactions**; no funds paid into a customer account |
| J14/J15 buy 2×10, sell 1×12 | A −20, then +12; position shares 2 → 1; `purchasePrice` unchanged |
| J16 profile update | 200 "Successfully updated customer profile"; customer and login show new data; restored afterwards |
| J17 reconciliation | A 277.50, F 100.00, B 230.00, Loan 500.00 — matches the expected ledger |

### 2.2 Edge probes

| ID | Input | Status | Effect on state |
|---|---|---|---|
| E-AUTH1/2 | wrong password / unknown user | 400 `Invalid username and/or password` (identical) | — |
| E-AUTH3 | `' OR '1'='1` username | 403 Cloudflare challenge page | Blocked by the CDN WAF; app behavior not observable |
| E-AUTH4 | `Accept: application/xml` | 200 XML | — |
| E-AUTH5 | read own customer, no credentials/session | **200 full profile incl. SSN** | — |
| E-ID1–3,5,6 | IDs `-1`, `0` | 400 plain text `Could not find …` | — |
| E-ID4, E-TRX2, E-TRF8 | non-numeric ID / amount | 404, empty body | — |
| E-TRF1 | transfer 0 | 200 "Successfully transferred $0" | no change |
| E-TRF2 | transfer −1 F→A | 200 "Successfully transferred $-1" | **F +1, A −1 (money moved in reverse)** |
| E-TRF3 | transfer 100000 (balance 101) | 200 success | **F = −99,899.00, A = +100,276.50** |
| E-TRF4 | same source and target | 200 success | no change |
| E-TRF5 | target `-1` | 400 `Could not find account number 23001 and/or -1` | no change |
| E-TRF6 | missing `amount` | **500 HTML error page** | no change |
| E-TRF7 | transfer 0.005 | 200 success | **Both accounts become permanently unreadable (500)** — see D-01 |
| E-DEP1 | deposit 0 | 200 success | no change; **0.00 credit transaction recorded** |
| E-DEP2 | deposit −5 | 200 "Successfully deposited $-5" | **balance −5; "Credit −5" transaction** |
| E-WDR1 | withdraw 100000 (balance 95) | 200 success | **balance −99,905** |
| E-WDR2 | withdraw −5 | 200 success | **balance +5** |
| E-WDR3 | withdraw 0 | 200 success | 0.00 debit transaction recorded |
| E-BIL1 | billpay 100000 (balance −99,900) | 200 echo | **balance −199,900** |
| E-BIL2 | billpay with `{}` payee | 200 `payeeName: null` | debited; transaction "Bill Payment to null" |
| E-BIL3 | billpay −5 | 200 echo amount −5 | **balance +5** |
| E-LON1–4 | negative amount, down payment > balance, down payment > amount, 0 | 500 | **Inconclusive**: customer's account list was broken by D-01 at the time (see §6) |
| E-OPN1 | create account from `-1` | 400 `Could not create new account …` | — |
| E-TRX1 | `onDate/not-a-date` | 400 `Unable to parse date not-a-date` | — |
| E-PRF1 | profile update without `lastName` | 500 HTML | profile unchanged |

Response times: all successful calls under 1 s. Bursts trigger Cloudflare rate limiting (HTTP 429, error 1015) after ~60 rapid requests; a 1.5 s pace avoided it.

## 3. Business-rules ledger

Status: **Confirmed** = observed behavior matches the rule · **Violated** = candidate defect (formalised in Stage 4) · **Ambiguous** = no reliable oracle → spec question.

| ID | Rule / assumption | Source | Confidence | Status | Evidence |
|---|---|---|---|---|---|
| BR-01 | Transfer debits source and credits target by the same amount; total conserved | Banking norm + UI | High | Confirmed (positive amounts) | J09 |
| BR-02 | Every money movement creates exactly one transaction with matching amount, type and date | Banking norm + UI | High | Confirmed for transfer/deposit/withdraw/billpay; **Violated** for loan (no transaction on LOAN account) | J11, J13 |
| BR-03 | Amounts ≤ 0 are rejected and change no balance or ledger | Banking norm | High | **Violated** — 0 accepted and recorded; negatives reverse the operation | E-TRF1/2, E-DEP1/2, E-WDR2/3, E-BIL3 |
| BR-04 | Debits above the available balance are rejected (no overdraft policy is documented) | Banking norm | Medium | **Violated** — unlimited overdraft on transfer, withdraw, billpay | E-TRF3, E-WDR1, E-BIL1 |
| BR-05 | A new account is funded with 100.00 from the source account | UI + observed | High | Confirmed (balance effect); **response body shows 0** | J06, J06b |
| BR-06 | Approved loan creates a LOAN account holding the loan amount; down payment debited from source | UI + observed | Medium | Confirmed (balances); ledger missing; disbursement model unclear | J13, J13b |
| BR-07 | Buying a position debits shares × price; selling credits shares × sale price | Swagger + banking norm | Medium | Confirmed | J14, J15 |
| BR-08 | The same entity returns identical data from every endpoint | Consistency norm | High | Confirmed (login = customer; list = account; transaction by id = list entry); **Violated** by createAccount response | J03, J05, J11c, J06 |
| BR-09 | Invalid input returns 4xx with a clear message, never 5xx | REST norm | High | **Partially violated** — missing/invalid params give 500 HTML or empty 404 | E-TRF6, J12g, E-PRF1, E-ID4 |
| BR-10 | Monetary amounts have at most 2 decimals; anything finer is rejected or rounded | Banking norm | High | **Violated** — 0.005 accepted and corrupts accounts | E-TRF7, repro log |
| BR-11 | Account and customer data are only available to the authenticated owner | Banking norm | High | **Violated** — no authentication at all; reads and writes need no session | E-AUTH5; all writes in this run |
| BR-12 | Failed login doesn't reveal whether the username exists | Security norm | High | Confirmed (identical 400 + message) | E-AUTH1/2 |
| BR-13 | Transfer source and target must differ | Banking norm | Medium | **Violated / Ambiguous** — accepted with success message | E-TRF4 |
| BR-14 | Bill payment requires a payee name (and address/account) | UI form + banking norm | Medium | **Violated** — empty payee accepted | E-BIL2 |
| BR-15 | Date filters use `MM-dd-yyyy`; month accepts name, number or `All`; type is `Credit`/`Debit`/`All` (case-sensitive) | Observed | High | Recorded as rule for test design | J12a–i |
| BR-16 | Profile update changes only the supplied values and requires all fields | Swagger (all params required) | Medium | Confirmed (update + restore); missing field → 500 instead of 400 | J16, E-PRF1 |
| BR-17 | Failed login uses 401 Unauthorized | REST norm | Medium | **Ambiguous** — 400 returned | E-AUTH1 |
| BR-18 | Unknown resource IDs return 404 | REST norm | Medium | **Ambiguous** — 400 with text for numeric IDs, 404 empty for non-numeric | E-ID1–6 |

## 4. Candidate defects (to be confirmed and written up in Stage 4)

| ID | Severity (proposed) | Endpoint | Summary | Evidence |
|---|---|---|---|---|
| D-01 | Critical | `POST /transfer` | A transfer of 0.005 is accepted; afterwards both accounts, their transactions and the customer's account list return 500 permanently (reproduced on fresh accounts) | E-TRF7, `repro-subcent-transfer.log` |
| D-02 | Critical | all | No authentication or authorization: any caller can read any customer (incl. SSN) and move money from any account by ID | E-AUTH5, every write in this run |
| D-03 | Critical | `POST /transfer` | Negative amount moves money from target to source, reported as success | E-TRF2 |
| D-04 | High | `/transfer`, `/withdraw`, `/billpay` | No balance check: overdraws to −99,899 / −199,900 | E-TRF3, E-WDR1, E-BIL1 |
| D-05 | High | `/deposit`, `/withdraw`, `/billpay` | Negative amounts invert the operation (deposit −5 debits, withdraw −5 credits, billpay −5 credits) | E-DEP2, E-WDR2, E-BIL3 |
| D-06 | Medium | `/transfer`, `/deposit`, `/withdraw` | Zero amounts accepted with "Successfully …" and recorded as 0.00 transactions | E-TRF1, E-DEP1, E-WDR3 |
| D-07 | Medium | `/billpay` | Empty payee accepted; transaction "Bill Payment to null" | E-BIL2 |
| D-08 | Medium | `/transfer` | Same source and target accepted as success | E-TRF4 |
| D-09 | Medium | `/requestLoan` | Approved loan: LOAN account holds 500 with no transaction record; ledger and balance disagree | J13, `/accounts/24666/transactions` = `[]` |
| D-10 | Medium | `/createAccount` | Response returns `balance: 0`; the account actually holds 100.00 | J06, J06b, Stage 0 |
| D-11 | Medium | several | Missing/invalid parameters return 500 HTML error page (missing amount, type `CREDIT`, profile update without lastName) instead of 4xx | E-TRF6, J12g, E-PRF1 |
| D-12 | Medium | `/customers/update` | Password and SSN sent as query parameters; credentials in URL also for login | J16 |

## 5. Spec questions and contradictions

| ID | Question / contradiction | Sources in conflict |
|---|---|---|
| Q-01 | Is any overdraft allowed? If so, what is the limit per account type? | Spec silent; API allows unlimited |
| Q-02 | Are zero and negative amounts ever valid? | Spec `number` without minimum; API accepts all |
| Q-03 | What precision do amounts have (2 decimals?) and how should finer values be handled? | Spec silent; API accepts and breaks |
| Q-04 | Which HTTP status codes are intended for invalid input, unknown IDs and failed login? | Spec documents only `default` |
| Q-05 | Should transfers between the same account be rejected? | Spec silent; API accepts |
| Q-06 | Filter `type` values: spec enum says `Credit`/`Debit`, filter also takes `All`; `CREDIT` crashes. Which values are valid? | Spec vs API |
| Q-07 | Date format for filters is undocumented (`string`); only `MM-dd-yyyy` works, ISO dates silently return `[]` | Spec vs API |
| Q-08 | `Transaction.date` is `date-time` string in the spec, epoch milliseconds (date only) in the API | Spec vs API (C-02) |
| Q-09 | What decides loan approval? How is a loan disbursed (LOAN account balance vs. credit to customer)? Should it create transactions? | Spec silent; UI/API unclear |
| Q-10 | Is the API meant to require authentication/session? The login endpoint returns a customer but issues nothing used later | Spec has no security scheme |
| Q-11 | Bill pay: which payee fields are mandatory? Should `accountNumber` be credited if it is a ParaBank account? | Spec Payee has no `required`; UI form requires all fields |
| Q-12 | New account opening amount (100.00) is fixed and undocumented; should the createAccount response show it? | UI vs API response |

**Contract discrepancies:** C-01 createAccount response balance 0 vs 100 · C-02 `Transaction.date` type · C-03 filter `type` values · C-04 errors are plain text / HTML, not the declared JSON/XML schema · C-05 Swagger login summary publishes demo credentials "john/demo".

## 6. Impact on the next stages

1. **Both test users are partly broken** until ParaBank's next data reset. D-01 made accounts 21780, 23001 (Rktest2) and 28551, 28773 (Rktest1) unreadable, so `GET /customers/{id}/accounts` returns 500 for both customers, which breaks journey step J04 and, probably, loan requests. Single healthy accounts still work (Rktest2: 24555 SAVINGS, 24666 LOAN; Rktest1: 23112, 23223). Stage 3 needs either a fresh user or a reset. **Never run a sub-cent amount except on throwaway accounts, as the very last step.**
2. **Still to verify on a healthy customer:** loan negative cases (E-LON1–4), sell more shares than owned (E-INV1), and whether the loan down payment and position buy/sell create transactions on the source account (BR-02).
3. **Not yet done:** web UI cross-check of balances/transactions (plan Stage 1 step 3), to be done manually in the browser.
4. **Test design inputs:** `MM-dd-yyyy` dates; month name or number; type `Credit`/`Debit`/`All`; numeric-ID errors are 400 plain text; success messages are plain text "Successfully …"; loans for small amounts with a 10 % down payment are approved; new accounts get 100.00 from the source.
5. **Runner settings:** pace requests ≥ 1.5 s to stay under Cloudflare's rate limit; treat HTTP 429 as BLOCKED, not FAIL; redact passwords in every encoding (path, query `%21`, form `+`).
