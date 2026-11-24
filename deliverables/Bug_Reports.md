# Bug Reports — ParaBank REST API

**Candidate:** Roy Kazes · **Date:** <!-- auto:cycle-date -->2026-11-24<!-- /auto:cycle-date --> (latest full test cycle; first edition 2026-11-23) · **Format:** `docs/exercise/05_Bug_Report_Template.md`

**Environment (all reports):**
- ParaBank public sandbox `https://parabank.parasoft.com/parabank/services/bank`, behind Cloudflare.
- Client: Node 24 `fetch` and Postman CLI 1.93.1, no cookies or auth headers (the API has none).
- Stage 1 exploration on a throwaway customer (`qa_s1_…`, customer 15098), 2026-11-24 — `evidence/exploration/`.
<!-- auto:test-runs -->
- Stage 3 detection run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md) (<USERNAME>); UI cross-check [`2026-11-24T11-21-47Z-ui`](../results/kept/2026-11-24T11-21-47Z-ui/summary.md); manual run [`2026-11-24T11-22-15Z-manual`](../results/kept/2026-11-24T11-22-15Z-manual/summary.md).
- Stage 5 load run [`2026-11-24T11-41-04Z-load`](../results/kept/2026-11-24T11-41-04Z-load/summary.md) and isolation run [`2026-11-24T11-55-56Z-load`](../results/kept/2026-11-24T11-55-56Z-load/summary.md) (k6 and Node `fetch`, throwaway customers 12656 and 14543) — BUG-016.
- Stage 4 reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on fresh throwaway users: user R `qa_s4_mwungyju` (customer 16541) and user L `qa_s4_mwunlevw` (customer 16652), 12:07–12:12 UTC.
<!-- /auto:test-runs -->
- The public site wiped its data several times during the day, so account and customer numbers restart; every number below belongs to the run named next to it.

**How each defect was confirmed:**
1. Detected by a Stage 3 test case (or a manual test).
2. Reproduced again on a **fresh throwaway user**, next to a **control input** that works, with balances read before and after every call.
3. The evidence bundle `evidence/bugs/BUG-0NN/` holds the reproduction (`repro.md` / `repro.json`) and the matching failure records from the Stage 3 run (`stage3-failures.json`). Credentials are redacted everywhere.

**Basis of "expected":** as in the STD.
- `C#` = Swagger contract.
- `A#` = proposed business rule, **not yet confirmed by R&D**. These are *candidate* defects; severity assumes the rule is confirmed (STD §6).

## Summary

| ID | Title | Severity | Priority | Scope | Cases | Basis |
|---|---|---|---|---|---|---|
| [BUG-001](#bug-001) | Transfer of 0.005 is accepted and makes both accounts and the customer's account list unreadable (500) | Critical | P1 | In scope | TRF-09 | A5, A8 |
| [BUG-016](#bug-016) | Concurrent transfers from the same account lose debits: money is created (found by the load test) | Critical | P1 | In scope | NFR-02 (L4, L6) | A1, A7 |
| [BUG-002](#bug-002) | No authentication: anyone can read a customer's profile (incl. SSN) and accounts, and move their money | Critical | P1 | In scope | CUST-03, ACCT-04 | A6 |
| [BUG-003](#bug-003) | Negative amounts are accepted and move money in the opposite direction | Critical | P1 | In scope | TRF-03, DEP-03, WDR-03, BILL-04 | A3 |
| [BUG-017](#bug-017) | Selling more shares than the position holds is accepted: the position goes negative and money is created | Critical | P1 | Extended | Stage 1 E-INV1 | A4, A1 |
| [BUG-004](#bug-004) | Transfer, withdraw and bill pay accept amounts above the balance (unlimited overdraft) | High | P1 | In scope | TRF-02, WDR-02, BILL-02 | A4 |
| [BUG-005](#bug-005) | Loan is approved with a down payment larger than the source account balance; the account goes negative | High | P1 | In scope | LOAN-04 | A4 |
| [BUG-006](#bug-006) | Approved loan is not recorded in the loan account's transaction history | High | P2 | In scope | LOAN-01, JRN-01 J13e | A12 |
| [BUG-007](#bug-007) | Bill pay with an empty payee is accepted and takes the money ("Bill Payment to null") | High | P2 | In scope | BILL-03 | A11 |
| [BUG-008](#bug-008) | API login sends the password in the URL path | High | P2 | In scope | AUTH-03 | A6 |
| [BUG-009](#bug-009) | `createAccount` response shows balance 0 while the new account holds its opening amount | Medium | P2 | Extended | JRN-01 J06b | A7 |
| [BUG-010](#bug-010) | Zero amounts are accepted and recorded as 0.00 transactions | Medium | P2 | In scope | TRF-04, DEP-02, WDR-04 | A3 |
| [BUG-011](#bug-011) | Transfer to the same account is accepted and recorded | Medium | P2 | In scope | TRF-05 | A10 |
| [BUG-012](#bug-012) | Transfer without an amount returns 500 (and a non-numeric amount returns 404) | Medium | P2 | In scope | TRF-07 | C1, A8 |
| [BUG-013](#bug-013) | Month/type filter returns 500 for any type other than `Credit`, `Debit`, `All` | Medium | P2 | In scope | HIST-04 | A8 |
| [BUG-014](#bug-014) | Date filter silently returns an empty list for a wrongly formatted date | Medium | P3 | In scope | HIST-05 | A8 |
| [BUG-015](#bug-015) | Date fields are epoch numbers, the contract says date-time strings (`Transaction.date`, `LoanResponse.responseDate`) | Medium | P3 | In scope | HIST-01, LOAN-01, JRN-01 J13a | C1 |

**Severity scale:**
- **Critical:** money created or lost, money data inconsistent, another customer's data exposed, or auth bypass.
- **High:** an invalid financial operation is accepted, or validation is missing on a money endpoint.
- **Medium:** wrong status code, contract mismatch, or misleading error.
- **Low:** cosmetic.

**Priority:** P1 = fix before release · P2 = next sprint · P3 = backlog.

## Failure classification (Stage 4 exit gate)

Every non-passing result from Stage 3 and the manual tests, and what it turned out to be.

| Case | Stage 3 verdict | Isolation result | Outcome |
|---|---|---|---|
| CUST-03, ACCT-04 | FAIL | Same on fresh user R | Endpoint defect → BUG-002 |
| TRF-02, WDR-02, BILL-02 | FAIL | Same on fresh user R; exact balance (control) works | Endpoint defect → BUG-004 |
| TRF-03, DEP-03, WDR-03, BILL-04 | FAIL | Same on fresh user R; 1.00 (control) works | Endpoint defect → BUG-003 |
| TRF-04, DEP-02, WDR-04 | FAIL | Same on fresh user R | Endpoint defect → BUG-010 |
| TRF-05 | FAIL | Same on fresh user R | Endpoint defect → BUG-011 |
| TRF-07 | FAIL | Same on fresh user R; with amount (control) works | Endpoint defect → BUG-012 |
| BILL-03 | FAIL | Same on fresh user R; full payee (control) works | Endpoint defect → BUG-007 |
| LOAN-01 | FAIL | Same on fresh user R | Endpoint defects → BUG-006 (loan not recorded), BUG-015 (`responseDate` type) |
| LOAN-04 | FAIL | Same on fresh user R | Endpoint defect → BUG-005 |
| HIST-01 | FAIL | Same on fresh user R | Endpoint defect (contract) → BUG-015 |
| HIST-04 | FAIL | Same on fresh user R; `Credit` (control) works | Endpoint defect → BUG-013 |
| HIST-05 | FAIL | Same on fresh user R; `MM-dd-yyyy` (control) works | Endpoint defect → BUG-014 |
| JRN-01 J06b | FAIL | **Journey isolation:** no suite checks the create response, so it was reproduced directly on fresh user R → same | Endpoint defect (extended) → BUG-009 |
| JRN-01 J13a | FAIL | **Journey isolation:** suite case LOAN-01 fails the same way on fresh data | Endpoint defect → BUG-015 |
| JRN-01 J13e | FAIL | **Journey isolation:** suite case LOAN-01 fails the same way on fresh data | Endpoint defect → BUG-006 |
| AUTH-03 (manual) | FAIL | Design issue, confirmed on user R | Endpoint defect → BUG-008 |
| TRF-09 (manual) | FAIL | Reproduced 3 times on 3 different throwaway users (Stage 1 exploration, manual run, user R) | Endpoint defect → BUG-001 |
| NFR-02 L6 (load test) | FAIL | **Isolated on a fresh throwaway user:** 5 sequential transfers reconcile; in 3 rounds of 5 simultaneous transfers, 1 debit is lost | Endpoint defect (concurrency) → BUG-016 |
| AUTH-05 (manual) | BLOCKED | Cloudflare firewall answers 403 before ParaBank | Environment, not a ParaBank result → re-test on a local instance |
| TRF-08 (manual) | NEEDS-CLARIFICATION | Same transfer booked twice, no warning | Spec question S6 |
| LOAN-03 | NEEDS-CLARIFICATION | Denied with "insufficient funds" (no rule exists) | Spec question S8 |
| E-INV1 (Stage 1 exploration) | — (no suite case: buy/sell is extended) | **Reproduced on fresh user R** next to a normal buy and a normal sell (controls) | Endpoint defect (extended) → BUG-017 |
| Loan approval (Stage 3 observation) | — | **Isolated on fresh user L** (see S-LOAN) | Spec question S7: approval follows the customer's *total* balance, not the source account |

No functional failure was a sequence/state defect, and none was intermittent: every journey failure reproduced on fresh data through its endpoint (BUG-016 is intermittent by nature: it needs simultaneous requests). The suites now also check that a rejected request adds no transaction row, so each money failure above shows its stray ledger entries (e.g. TRF-05: a Debit and a Credit of 1.00 on S). Three test issues were found and fixed during Stage 3, before the official run:
- a helper misread plain-text error bodies;
- the journey picked up a share position left over from an earlier run;
- the suites were not independent because of the customer-total loan rule (fixed with a cleanup step).

---

<a id="bug-001"></a>
**ID:** BUG-001
**Title:** `POST /transfer` accepts 0.005 and leaves both accounts, and the customer's account list, permanently returning HTTP 500
**Endpoint / area:** `POST /transfer` (in scope) · effect on `GET /accounts/{id}`, `GET /customers/{id}/accounts`, web UI
**Environment:** <!-- auto:bug-env:BUG-001 -->public sandbox, 2026-11-24 12:12:02–12:12:12 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); manual run [`2026-11-24T11-22-15Z-manual`](../results/kept/2026-11-24T11-22-15Z-manual/summary.md) (TRF-09)<!-- /auto:bug-env:BUG-001 -->; also in the Stage 1 exploration (throwaway customer, `evidence/exploration/`)
**Severity:** Critical · **Priority:** P1
**Related test case:** TRF-09 · detected in Stage 1 exploration (probe E-TRF7), reproduced in the manual test and the Stage 4 run

**Steps to reproduce:**
1. Open two accounts X and Y for the same customer (each starts with the site's opening amount).
2. Control: `POST /transfer?fromAccountId=X&toAccountId=Y&amount=0.01` → 200; X −0.01, Y +0.01.
3. `POST /transfer?fromAccountId=X&toAccountId=Y&amount=0.005`.
4. `GET /accounts/X`, `GET /accounts/Y`, `GET /customers/{id}/accounts`; open Accounts Overview in the web UI.

<!-- auto:bug-result:BUG-001 -->
**Request:**
```
POST /parabank/services/bank/transfer?fromAccountId=25110&toAccountId=25221&amount=0.005
GET /parabank/services/bank/customers/16541/accounts
```

**Actual result:**
```
control · Control: transfer 0.01 X → Y → 200 Successfully transferred $0.01 from account #25110 to account #25221   25110: 100.00 → 99.99 · 25221: 100.00 → 100.01
tested  · Transfer 0.005 X → Y → 200 Successfully transferred $0.005 from account #25110 to account #25221   25110: 99.99 → NaN · 25221: 100.01 → NaN
tested  · Customer account list after the 0.005 transfer → 500 <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www…
manual · TRF-09: FAIL — Rule A5/A8: transfer of 0.005 answered 200 "Successfully transferred $0.005 from account #2877"; afterwards account 28773 → 500, account 28884 → 500, account list → 500. The accounts can no longer be read (reproduces Sta…
```
<!-- /auto:bug-result:BUG-001 -->

**Expected result:** The amount is rejected with 400 (or rounded to cents), and the accounts stay readable. Basis: A5 (amounts have at most 2 decimals), A8 (bad input → 4xx, never 5xx).

**Evidence:**
- `evidence/bugs/BUG-001/repro.md`
- `evidence/exploration/observations.md` (probe E-TRF7, run last because it breaks the accounts)
- Manual run <!-- auto:run:manual -->[`2026-11-24T11-22-15Z-manual`](../results/kept/2026-11-24T11-22-15Z-manual/summary.md)<!-- /auto:run:manual -->: screenshots `19-TRF-09-transfer-0.005.png` … `24-TRF-09-ui-activity.png` in its `screenshots/` folder

**Notes / suspected cause / impact:**
- Likely cause: the amount is stored with more precision than the balance column allows (or a rounding exception on read), so every later read of those accounts fails.
- One request permanently locks a customer out of **all** their accounts, in the API and the UI. Combined with BUG-002, anyone could do this to any customer.
- Every run of this test breaks two accounts, so it only ever runs on throwaway customers (Stage 1 exploration, manual TRF-09, Stage 4 reproduction); the account numbers are in each run's evidence. Recovery needs a data fix.

---

<a id="bug-002"></a>
**ID:** BUG-002
**Title:** API has no authentication: any caller can read any customer's profile (including SSN) and accounts, and move their money
**Endpoint / area:** all endpoints; shown on `GET /customers/{id}`, `GET /accounts/{id}`, `POST /transfer` (in scope)
**Environment:** <!-- auto:bug-env:BUG-002 -->public sandbox, 2026-11-24 12:07:42–12:07:53 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-002 -->
**Severity:** Critical · **Priority:** P1
**Related test case:** CUST-03, ACCT-04

**Steps to reproduce:**
1. Without logging in, and with no cookie or `Authorization` header, call `GET /customers/{customerId}` for a customer that is not yours.
2. Call `GET /accounts/{S}` for one of its accounts.
3. Call `POST /transfer?fromAccountId=S&toAccountId=T&amount=1`.

<!-- auto:bug-result:BUG-002 -->
**Request:**
```
GET /parabank/services/bank/customers/16541
GET /parabank/services/bank/accounts/22557
POST /parabank/services/bank/transfer?fromAccountId=22557&toAccountId=22668&amount=1
```

**Actual result:**
```
tested  · Profile of the customer, no cookie or credentials → 200 {"id":16541,"firstName":"QA","lastName":"Throwaway","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phoneNumber":"…
tested  · Account of the customer, no cookie or credentials → 200 {"id":22557,"customerId":16541,"type":"CHECKING","balance":100.00}
tested  · Transfer 1.00 S → T with no cookie or credentials → 200 Successfully transferred $1 from account #22557 to account #22668   22557: 100.00 → 99.00 · 22668: 100.00 → 101.00
Stage 3 · CUST-03: [A6] rejected with 401 or 403 (got 200) · [A6] no SSN in the response
Stage 3 · ACCT-04: [A6] rejected with 401 or 403 (got 200) · [A6] no balance data returned
```
<!-- /auto:bug-result:BUG-002 -->

**Expected result:** 401 or 403 and no data; no money moves. Basis: A6 (only the logged-in owner can see or move their money). The Swagger file declares no security scheme, so this needs R&D confirmation (S1). It may be intended for a demo; it must not exist in a real bank.

**Evidence:**
- `evidence/bugs/BUG-002/repro.md`
- `evidence/bugs/BUG-002/stage3-failures.json` (CUST-03, ACCT-04)
- STD §5.9 E2

**Notes / suspected cause / impact:** The API is fully open: customer and account IDs are sequential, so every customer's SSN and balances can be listed and their money moved. This also makes BUG-001, BUG-003 and BUG-004 exploitable against other customers. We did not test other people's data (ground rule), only our own users without credentials.

---

<a id="bug-003"></a>
**ID:** BUG-003
**Title:** Negative amounts are accepted by transfer, deposit, withdraw and bill pay, and move money in the opposite direction
**Endpoint / area:** `POST /transfer`, `/deposit`, `/withdraw`, `/billpay` (in scope)
**Environment:** <!-- auto:bug-env:BUG-003 -->public sandbox, 2026-11-24 12:08:03–12:08:31 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-003 -->
**Severity:** Critical · **Priority:** P1
**Related test case:** TRF-03, DEP-03, WDR-03, BILL-04

**Steps to reproduce:**
1. Control: `POST /transfer?fromAccountId=S&toAccountId=T&amount=1` → S −1, T +1.
2. `POST /transfer?fromAccountId=S&toAccountId=T&amount=-1`.
3. `POST /deposit?accountId=S&amount=-5`.
4. `POST /withdraw?accountId=S&amount=-5`.
5. `POST /billpay?accountId=S&amount=-5` with a full payee.

<!-- auto:bug-result:BUG-003 -->
**Request:**
```
POST /parabank/services/bank/transfer?fromAccountId=22557&toAccountId=22668&amount=-1
POST /parabank/services/bank/deposit?accountId=22557&amount=-5
POST /parabank/services/bank/withdraw?accountId=22557&amount=-5
POST /parabank/services/bank/billpay?accountId=22557&amount=-5
{"name":"City Utilities","address":{"street":"1 Main St","city":"Springfield","state":"IL","zipCode":"62701"},"phoneNumber":"5550100","accountNumber":22668}
```

**Actual result:**
```
control · Control: transfer 1.00 S → T → 200 Successfully transferred $1 from account #22557 to account #22668   22557: 99.00 → 98.00 · 22668: 101.00 → 102.00
tested  · Transfer −1.00 S → T → 200 Successfully transferred $-1 from account #22557 to account #22668   22557: 98.00 → 99.00 · 22668: 102.00 → 101.00
tested  · Deposit −5.00 into S → 200 Successfully deposited $-5 to account #22557   22557: 99.00 → 94.00
tested  · Withdraw −5.00 from S → 200 Successfully withdrew $-5 from account #22557   22557: 94.00 → 99.00
tested  · Bill pay −5.00 from S → 200 {"payeeName":"City Utilities","amount":-5,"accountId":22557}   22557: 99.00 → 104.00 · 22668: 101.00 → 101.00
Stage 3 · TRF-03: [A3] rejected with 4xx (got 200) · [A3] account 26886 balance unchanged (-100000 -> -99900 cents) · [A3] account 26997 balance unchanged (120000 -> 119900 cents)
Stage 3 · DEP-03: [A3] rejected with 4xx (got 200) · [A3] account 27108 balance unchanged (10000 -> 9500 cents) · [A3] no transaction added to S (new: ["Credit -500"])
Stage 3 · WDR-03: [A3] rejected with 4xx (got 200) · [A3] account 27219 balance unchanged (-100000 -> -99500 cents) · [A3] no transaction added to S (new: ["Debit -500"])
Stage 3 · BILL-04: [A3] rejected with 4xx (got 200) · [A3] account 27330 balance unchanged (-100100 -> -99600 cents) · [A3] no transaction added to S (new: ["Debit -500"])
```
<!-- /auto:bug-result:BUG-003 -->

**Expected result:** 400 for any amount ≤ 0; balances unchanged. Basis: A3 (amounts must be greater than zero).

**Evidence:**
- `evidence/bugs/BUG-003/repro.md`
- `evidence/bugs/BUG-003/stage3-failures.json` (8 records)
- STD §5.9 E3, E7, E8, E9

**Notes / suspected cause / impact:**
- No sign check on the amount.
- A negative transfer pulls money **out of the destination account** without its owner's action. With BUG-002 that means stealing from any account.
- A negative withdrawal or bill payment creates money from nothing. The ledger records it as normal activity.

---

<a id="bug-004"></a>
**ID:** BUG-004
**Title:** Transfer, withdraw and bill pay accept amounts above the account balance (unlimited overdraft)
**Endpoint / area:** `POST /transfer`, `/withdraw`, `/billpay` (in scope)
**Environment:** <!-- auto:bug-env:BUG-004 -->public sandbox, 2026-11-24 12:10:04–12:10:23 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-004 -->
**Severity:** High · **Priority:** P1
**Related test case:** TRF-02, WDR-02, BILL-02

**Steps to reproduce:**
1. Control: transfer T's exact balance to S → 200, T = 0.00.
2. `POST /transfer?fromAccountId=T&toAccountId=S&amount=0.01` (T holds 0.00).
3. `POST /withdraw?accountId=T&amount=1000`.
4. `POST /billpay?accountId=T&amount=1000` with a full payee.

<!-- auto:bug-result:BUG-004 -->
**Request:**
```
POST /parabank/services/bank/transfer?fromAccountId=22668&toAccountId=22557&amount=0.01
POST /parabank/services/bank/withdraw?accountId=22668&amount=1000
POST /parabank/services/bank/billpay?accountId=22668&amount=1000
{"name":"City Utilities","address":{"street":"1 Main St","city":"Springfield","state":"IL","zipCode":"62701"},"phoneNumber":"5550100","accountNumber":22557}
```

**Actual result:**
```
control · Control: transfer the exact balance of T to S → 200 Successfully transferred $102.00 from account #22668 to account #22557   22557: 101.00 → 203.00 · 22668: 102.00 → 0.00
tested  · Transfer 0.01 more than T holds (T = 0.00) → 200 Successfully transferred $0.01 from account #22668 to account #22557   22557: 203.00 → 203.01 · 22668: 0.00 → -0.01
tested  · Withdraw 1000.00 from T → 200 Successfully withdrew $1000 from account #22668   22668: -0.01 → -1000.01
tested  · Bill pay 1000.00 from T → 200 {"payeeName":"City Utilities","amount":1000,"accountId":22668}   22668: -1000.01 → -2000.01
Stage 3 · TRF-02: [A4] rejected with 4xx (got 200) · [A4] account 26886 balance unchanged (0 -> -100000 cents) · [A4] account 26997 balance unchanged (20000 -> 120000 cents)
Stage 3 · WDR-02: [A4] rejected with 4xx (got 200) · [A4] account 27219 balance unchanged (9500 -> -100000 cents) · [A4] no transaction added to S (new: ["Debit 109500"])
Stage 3 · BILL-02: [A4] rejected with 4xx (got 200) · [A4] account 27330 balance unchanged (9500 -> -100000 cents) · [A4] no transaction added to S (new: ["Debit 109500"])
```
<!-- /auto:bug-result:BUG-004 -->

**Expected result:** Rejected (4xx, e.g. "insufficient funds"); balance unchanged. Basis: A4 (you can't take out more money than the account holds). No overdraft policy is documented anywhere (S2); the web UI also offers no overdraft.

**Evidence:**
- `evidence/bugs/BUG-004/repro.md`
- `evidence/bugs/BUG-004/stage3-failures.json` (6 records)
- STD §5.9 E4, E5, E6

**Notes / suspected cause / impact:**
- No balance check before debiting.
- Accounts can go to any negative value (the Stage 1 exploration reached −299,899.00).
- Ranked High rather than Critical only because an overdraft policy *might* exist; if R&D confirms there is none, this is money created.

---

<a id="bug-005"></a>
**ID:** BUG-005
**Title:** `requestLoan` approves a loan whose down payment is larger than the source account's balance and debits it, leaving the account negative
**Endpoint / area:** `POST /requestLoan` (in scope)
**Environment:** <!-- auto:bug-env:BUG-005 -->public sandbox, 2026-11-24 12:10:43–12:10:43 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-005 -->
**Severity:** High · **Priority:** P1
**Related test case:** LOAN-04 (redesigned so that only this rule applies: the loan amount stays above the down payment)

**Steps to reproduce:**
1. Make sure the customer's total balance across accounts is positive (it is for a new customer).
2. Read the balance B of source account S.
3. `POST /requestLoan?customerId={id}&amount=1000&downPayment=B+100.00&fromAccountId=S` (the down payment is 100.00 more than S holds; the loan stays above the down payment).

<!-- auto:bug-result:BUG-005 -->
**Request:**
```
POST /parabank/services/bank/requestLoan?customerId=16541&amount=1000&downPayment=253.01&fromAccountId=22557
```

**Actual result:**
```
tested  · Request loan 1000 with down payment 253.01 (S holds 153.01) → 200 {"responseDate":1795522241311,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":23001}   22557: 153.01 → -100.00
Stage 3 · LOAN-04: [A4] denied (got 200, approved true) · [A4] account 27552 balance unchanged (3000 -> -1000 cents) · [A4] no loan account opened
```
<!-- /auto:bug-result:BUG-005 -->

**Expected result:** Denied (`approved: false` with a reason), nothing changes. Basis: A4. ParaBank itself denies loans with "insufficient funds for down payment" in other cases (S-LOAN), so the intent exists.

**Evidence:**
- `evidence/bugs/BUG-005/repro.md`
- `evidence/bugs/BUG-005/stage3-failures.json` (LOAN-04)

**Notes / suspected cause / impact:**
- Approval checks the down payment against the customer's **total** balance (isolated in S-LOAN), but the money is then taken from **one** account with no check of that account.
- A customer with savings elsewhere can overdraw any checking account through a loan.

---

<a id="bug-006"></a>
**ID:** BUG-006
**Title:** An approved loan is not recorded in the loan account's transaction history: the account shows a 500.00 balance with no transaction explaining it
**Endpoint / area:** `POST /requestLoan`; `GET /accounts/{loanId}/transactions` (in scope); web UI account activity
**Environment:** <!-- auto:bug-env:BUG-006 -->public sandbox, 2026-11-24 12:10:30–12:10:36 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-006 -->
**Severity:** High · **Priority:** P2
**Related test case:** LOAN-01, JRN-01 J13e

**Steps to reproduce:**
1. `POST /requestLoan?customerId={id}&amount=500&downPayment=50&fromAccountId=S` → approved; the response's `accountId` is the new loan account L.
2. `GET /accounts/L` → LOAN, balance 500.00.
3. `GET /accounts/L/transactions`.
4. Control: `GET /accounts/S/transactions/amount/50` (source account: the down payment is there).

<!-- auto:bug-result:BUG-006 -->
**Request:**
```
POST /parabank/services/bank/requestLoan?customerId=16541&amount=500&downPayment=50&fromAccountId=22557
GET /parabank/services/bank/accounts/22890/transactions
```

**Actual result:**
```
tested  · Request loan 500, down payment 50, from S → 200 {"responseDate":1795522229153,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":22890}   22557: 203.01 → 153.01
read    · Loan account → 200 {"id":22890,"customerId":16541,"type":"LOAN","balance":500.00}
tested  · Transactions of the loan account → 200 []
control · Transactions of S with amount 50.00 → 200 [{"id":69088,"accountId":22557,"type":"Debit","date":1795478400000,"amount":50.00,"description":"Down Payment for Loan # 22890"}]
Stage 3 · LOAN-01: [C1] loanResponse schema (data.responseDate should be string) · [A12] the loan is recorded in the loan account history (found 0)
Stage 3 · JRN-01 J13e: [A12] the loan is recorded in the loan account history (found 0)
```
<!-- /auto:bug-result:BUG-006 -->

**Expected result:** The loan account history holds at least one entry that explains its balance (loan disbursement / principal). Basis: A2 (every money movement creates a matching transaction) and A12, both proposed rules. How a loan should appear is open question S7/Q9.

**Evidence:**
- `evidence/bugs/BUG-006/repro.md`
- `evidence/bugs/BUG-006/stage3-failures.json`
- UI cross-check <!-- auto:run:ui -->[`2026-11-24T11-21-47Z-ui`](../results/kept/2026-11-24T11-21-47Z-ui/summary.md)<!-- /auto:run:ui --> (check J13: UI and API agree, 0 rows)
- STD §5.9 E14

**Notes / suspected cause / impact:**
- The loan account is created with an opening balance but no transaction row is written.
- Statements cannot explain the balance, and reconciliation (sum of transactions = balance) fails for every loan account.
- The down payment *is* recorded (control step 4).

---

<a id="bug-007"></a>
**ID:** BUG-007
**Title:** `POST /billpay` with an empty payee `{}` is accepted and takes the money ("Bill Payment to null")
**Endpoint / area:** `POST /billpay` (in scope)
**Environment:** <!-- auto:bug-env:BUG-007 -->public sandbox, 2026-11-24 12:09:04–12:09:11 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-007 -->
**Severity:** High · **Priority:** P2
**Related test case:** BILL-03

**Steps to reproduce:**
1. Control: `POST /billpay?accountId=S&amount=1` with a full payee → 200, S −1.
2. `POST /billpay?accountId=S&amount=1` with body `{}`.
3. `GET /accounts/S/transactions/amount/1`.

<!-- auto:bug-result:BUG-007 -->
**Request:**
```
POST /parabank/services/bank/billpay?accountId=22557&amount=1
{}
```

**Actual result:**
```
control · Control: bill pay 1.00 with full payee → 200 {"payeeName":"City Utilities","amount":1,"accountId":22557}   22557: 104.00 → 103.00
tested  · Bill pay 1.00 with empty payee {} → 200 {"payeeName":null,"amount":1,"accountId":22557}   22557: 103.00 → 102.00
read    · Transactions of S with amount 1.00 → 200 [{"id":65314,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":"Funds Transfer Sent"},{"id":65536,"accountId":22557,"t…
Stage 3 · BILL-03: [A11] rejected with 4xx (got 200) · [A11] account 27330 balance unchanged (-100000 -> -100100 cents) · [A11] no transaction added to S (new: ["Debit 100"])
```
<!-- /auto:bug-result:BUG-007 -->

**Expected result:** 400 naming the missing payee fields; no money taken. Basis: A11 (bill pay needs a payee; the web UI bill-pay form marks every field as required). Required fields are open question S5.

**Evidence:**
- `evidence/bugs/BUG-007/repro.md`
- `evidence/bugs/BUG-007/stage3-failures.json`
- STD §5.9 E12

**Notes / suspected cause / impact:** The payee is not validated server-side. Money leaves the customer's account to nobody, with no way to trace or recover it.

---

<a id="bug-008"></a>
**ID:** BUG-008
**Title:** API login sends the password in the URL path (`GET /login/{username}/{password}`)
**Endpoint / area:** `GET /login/{username}/{password}` (in scope)
**Environment:** <!-- auto:bug-env:BUG-008 -->public sandbox, 2026-11-24 12:07:54–12:07:54 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); manual run [`2026-11-24T11-22-15Z-manual`](../results/kept/2026-11-24T11-22-15Z-manual/summary.md) (AUTH-03)<!-- /auto:bug-env:BUG-008 -->
**Severity:** High · **Priority:** P2
**Related test case:** AUTH-03 (manual)

**Steps to reproduce:**
1. Open the API documentation: login is `GET /login/{username}/{password}`.
2. `GET /login/{username}/NotMyRealPassword-123` (deliberately wrong password).

<!-- auto:bug-result:BUG-008 -->
**Request:**
```
GET /parabank/services/bank/login/qa_s4_mwungyju/NotMyRealPassword-123
```

**Actual result:**
```
tested  · Login with a wrong password: the server parses the password from the URL path → 400 Invalid username and/or password
manual · AUTH-03: FAIL — Rule A6 not met: the only API login is GET /login/{username}/{password}, so the password travels in the URL path (server answered 400 "Invalid username and/or password" to the wrong password, proving it reads it from the…
```
<!-- /auto:bug-result:BUG-008 -->

**Expected result:** Credentials sent in a POST body or an `Authorization` header over HTTPS, never in the URL. Basis: A6 and common security practice (URLs end up in proxy, CDN and server access logs, and in browser history).

**Evidence:**
- Manual run <!-- auto:run:manual -->[`2026-11-24T11-22-15Z-manual`](../results/kept/2026-11-24T11-22-15Z-manual/summary.md)<!-- /auto:run:manual -->: screenshots `01-AUTH-03-swagger.png` and `02-AUTH-03-wrong-password.png` in its `screenshots/` folder
- `evidence/bugs/BUG-008/repro.md`

**Notes / suspected cause / impact:**
- This is a design issue in the endpoint contract.
- During this exercise the password leaked into our own tool logs through a URL-encoded character, which is exactly the risk; redaction now covers every encoding.
- Every login exposes the password to every system that logs URLs.

---

<a id="bug-009"></a>
**ID:** BUG-009
**Title:** `POST /createAccount` response shows balance 0 while the new account actually holds its opening amount
**Endpoint / area:** `POST /createAccount` (extended)
**Environment:** <!-- auto:bug-env:BUG-009 -->public sandbox, 2026-11-24 12:09:52–12:09:54 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-009 -->
**Severity:** Medium · **Priority:** P2
**Related test case:** JRN-01 J06b (detected by the journey; no suite case covers this endpoint)

**Steps to reproduce:**
1. `POST /createAccount?customerId={id}&newAccountType=0&fromAccountId=A`.
2. `GET /accounts/{id}` for the returned ID.

<!-- auto:bug-result:BUG-009 -->
**Request:**
```
POST /parabank/services/bank/createAccount?customerId=16541&newAccountType=0&fromAccountId=22446
```

**Actual result:**
```
tested  · Open a new CHECKING account from A → 200 {"id":22779,"customerId":16541,"type":"CHECKING","balance":0}   22446: 315.50 → 215.50
read    · Read the new account → 200 {"id":22779,"customerId":16541,"type":"CHECKING","balance":100.00}
Stage 3 · JRN-01 J06b: [A7] create response balance = account balance (0 vs 10000 cents)
```
<!-- /auto:bug-result:BUG-009 -->

**Expected result:** The response shows the real balance (the opening amount moved in; the amount itself is a site setting, S12). Basis: A7 (the same data looks the same from every endpoint).

**Evidence:**
- `evidence/bugs/BUG-009/repro.md`
- `evidence/bugs/BUG-009/stage3-failures.json`
- STD §5.9 E15

**Notes / suspected cause / impact:**
- The response is probably built before the opening funds are moved.
- A client that trusts the response shows a wrong balance.
- Severity Medium, not Critical: the stored balance is correct and every read returns it.

---

<a id="bug-010"></a>
**ID:** BUG-010
**Title:** Zero amounts are accepted by transfer, deposit and withdraw and recorded as 0.00 transactions
**Endpoint / area:** `POST /transfer`, `/deposit`, `/withdraw` (in scope)
**Environment:** <!-- auto:bug-env:BUG-010 -->public sandbox, 2026-11-24 12:08:39–12:08:52 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-010 -->
**Severity:** Medium · **Priority:** P2
**Related test case:** TRF-04, DEP-02, WDR-04

**Steps to reproduce:**
1. `POST /transfer?fromAccountId=S&toAccountId=T&amount=0`.
2. `POST /deposit?accountId=S&amount=0`.
3. `POST /withdraw?accountId=S&amount=0`.
4. `GET /accounts/S/transactions/amount/0`.

<!-- auto:bug-result:BUG-010 -->
**Request:**
```
POST /parabank/services/bank/transfer?fromAccountId=22557&toAccountId=22668&amount=0
POST /parabank/services/bank/deposit?accountId=22557&amount=0
POST /parabank/services/bank/withdraw?accountId=22557&amount=0
```

**Actual result:**
```
tested  · Transfer 0.00 S → T → 200 Successfully transferred $0 from account #22557 to account #22668   22557: 104.00 → 104.00 · 22668: 101.00 → 101.00
tested  · Deposit 0.00 into S → 200 Successfully deposited $0 to account #22557   22557: 104.00 → 104.00
tested  · Withdraw 0.00 from S → 200 Successfully withdrew $0 from account #22557   22557: 104.00 → 104.00
read    · Transactions of S: 0.00 rows recorded? → 200 [{"id":66535,"accountId":22557,"type":"Debit","date":1795478400000,"amount":0.00,"description":"Funds Transfer Sent"},{"id":66757,"accountId":22557,"t…
Stage 3 · TRF-04: [A3] rejected with 4xx (got 200) · [A3] no transaction added to S (new: ["Debit 0"]) · [A3] no transaction added to T (new: ["Credit 0"])
Stage 3 · DEP-02: [A3] rejected with 4xx (got 200) · [A3] no transaction added to S (new: ["Credit 0"])
Stage 3 · WDR-04: [A3] rejected with 4xx (got 200) · [A3] no transaction added to S (new: ["Debit 0"])
```
<!-- /auto:bug-result:BUG-010 -->

**Expected result:** 400; no transaction recorded. Basis: A3.

**Evidence:**
- `evidence/bugs/BUG-010/repro.md`
- `evidence/bugs/BUG-010/stage3-failures.json` (6 records)
- STD §5.9 E10

**Notes / suspected cause / impact:** Same missing validation as BUG-003 (fix together). No money moves, but statements fill with meaningless rows, and "successful" responses hide client bugs.

---

<a id="bug-011"></a>
**ID:** BUG-011
**Title:** Transfer from an account to itself is accepted and recorded
**Endpoint / area:** `POST /transfer` (in scope)
**Environment:** <!-- auto:bug-env:BUG-011 -->public sandbox, 2026-11-24 12:08:57–12:08:58 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-011 -->
**Severity:** Medium · **Priority:** P2
**Related test case:** TRF-05

**Steps to reproduce:**
1. `POST /transfer?fromAccountId=S&toAccountId=S&amount=1`.
2. `GET /accounts/S/transactions/amount/1`.

<!-- auto:bug-result:BUG-011 -->
**Request:**
```
POST /parabank/services/bank/transfer?fromAccountId=22557&toAccountId=22557&amount=1
```

**Actual result:**
```
tested  · Transfer 1.00 S → S → 200 Successfully transferred $1 from account #22557 to account #22557   22557: 104.00 → 104.00
read    · Transactions of S with amount 1.00 → 200 [{"id":65314,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":"Funds Transfer Sent"},{"id":65536,"accountId":22557,"t…
Stage 3 · TRF-05: [A10] rejected with 4xx (got 200) · [A10] no transaction added to S (new: ["Credit 100","Debit 100"])
```
<!-- /auto:bug-result:BUG-011 -->

**Expected result:** 400 ("source and destination must differ"); nothing recorded. Basis: A10 (proposed; S4).

**Evidence:**
- `evidence/bugs/BUG-011/repro.md`
- `evidence/bugs/BUG-011/stage3-failures.json`
- STD §5.9 E11

**Notes / suspected cause / impact:** Meaningless ledger entries; usually a symptom of a client mistake that should be reported back.

---

<a id="bug-012"></a>
**ID:** BUG-012
**Title:** `POST /transfer` without an amount returns 500 (HTML error page); a non-numeric amount returns 404
**Endpoint / area:** `POST /transfer` (in scope)
**Environment:** <!-- auto:bug-env:BUG-012 -->public sandbox, 2026-11-24 12:09:19–12:09:37 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-012 -->
**Severity:** Medium · **Priority:** P2
**Related test case:** TRF-07

**Steps to reproduce:**
1. Control: `POST /transfer?fromAccountId=S&toAccountId=T&amount=1` → 200.
2. `POST /transfer?fromAccountId=S&toAccountId=T` (no amount).
3. `POST /transfer?fromAccountId=S&toAccountId=T&amount=abc`.

<!-- auto:bug-result:BUG-012 -->
**Request:**
```
POST /parabank/services/bank/transfer?fromAccountId=22557&toAccountId=22668
POST /parabank/services/bank/transfer?fromAccountId=22557&toAccountId=22668&amount=abc
```

**Actual result:**
```
control · Control: transfer 1.00 S → T → 200 Successfully transferred $1 from account #22557 to account #22668   22557: 102.00 → 101.00 · 22668: 101.00 → 102.00
tested  · Transfer without amount → 500 <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www…   22557: 101.00 → 101.00 · 22668: 102.00 → 102.00
tested  · Transfer with amount "abc" → 404    22557: 101.00 → 101.00 · 22668: 102.00 → 102.00
Stage 3 · TRF-07: [C1] rejected with 4xx (got 500) · [A8] no server error (got 500)
```
<!-- /auto:bug-result:BUG-012 -->

**Expected result:** 400 with a message naming the missing or invalid parameter. Basis: C1 (amount is a required parameter) and A8 (bad input → 4xx, never 5xx).

**Evidence:**
- `evidence/bugs/BUG-012/repro.md`
- `evidence/bugs/BUG-012/stage3-failures.json`
- STD §5.9 E13

**Notes / suspected cause / impact:**
- The missing-parameter exception isn't handled and reaches the servlet error page.
- The 404 is wrong too: the resource exists, only the input is bad.
- Clients can't tell their own mistakes from server failures, and 500s pollute monitoring.

---

<a id="bug-013"></a>
**ID:** BUG-013
**Title:** `GET .../transactions/month/{month}/type/{type}` returns 500 for any type other than `Credit`, `Debit`, `All` (e.g. `CREDIT`)
**Endpoint / area:** transaction month/type filter (in scope)
**Environment:** <!-- auto:bug-env:BUG-013 -->public sandbox, 2026-11-24 12:09:38–12:09:42 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-013 -->
**Severity:** Medium · **Priority:** P2
**Related test case:** HIST-04

**Steps to reproduce:**
1. Control: `GET /accounts/S/transactions/month/November/type/Credit` → 200.
2. `GET /accounts/S/transactions/month/November/type/CREDIT`.
3. `GET /accounts/S/transactions/month/November/type/foo`.

<!-- auto:bug-result:BUG-013 -->
**Request:**
```
GET /parabank/services/bank/accounts/22557/transactions/month/November/type/CREDIT
GET /parabank/services/bank/accounts/22557/transactions/month/November/type/foo
```

**Actual result:**
```
control · Control: month filter with type Credit → 200 [{"id":64981,"accountId":22557,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":65980,"accountId":2…
tested  · Month filter with type CREDIT → 500 <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www…
tested  · Month filter with type foo → 500 <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www…
Stage 3 · HIST-04: [A8] no server error (got 500) · [A8] rejected with 4xx (got 500)
```
<!-- /auto:bug-result:BUG-013 -->

**Expected result:** 400 listing the allowed values, or case-insensitive matching. Basis: A8. The allowed values are not documented (S9).

**Evidence:**
- `evidence/bugs/BUG-013/repro.md`
- `evidence/bugs/BUG-013/stage3-failures.json`
- STD §5.9 E13

**Notes / suspected cause / impact:** Probably a strict enum parse (`valueOf`) with no error handling. Any client that sends the obvious upper-case value gets a server error.

---

<a id="bug-014"></a>
**ID:** BUG-014
**Title:** Date filters silently return an empty list when the date is in another format (e.g. ISO `2026-11-24`)
**Endpoint / area:** `GET .../transactions/onDate/{onDate}` (and `fromDate/toDate`) (in scope)
**Environment:** <!-- auto:bug-env:BUG-014 -->public sandbox, 2026-11-24 12:09:44–12:09:45 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-014 -->
**Severity:** Medium · **Priority:** P3
**Related test case:** HIST-05

**Steps to reproduce:**
1. Control: `GET /accounts/S/transactions/onDate/{today as MM-dd-yyyy}` → today's rows.
2. `GET /accounts/S/transactions/onDate/{today as yyyy-MM-dd}`.

<!-- auto:bug-result:BUG-014 -->
**Request:**
```
GET /parabank/services/bank/accounts/22557/transactions/onDate/2026-11-24
```

**Actual result:**
```
control · Control: onDate in MM-dd-yyyy → 200 [{"id":64981,"accountId":22557,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":65314,"accountId":2…
tested  · onDate in ISO yyyy-MM-dd → 200 []
Stage 3 · HIST-05: [A8] rejected with 4xx (got 200)
```
<!-- /auto:bug-result:BUG-014 -->

**Expected result:** 400 "date must be MM-dd-yyyy", or the same rows as the control. Basis: A8. The date format is not documented (S10).

**Evidence:**
- `evidence/bugs/BUG-014/repro.md`
- `evidence/bugs/BUG-014/stage3-failures.json`

**Notes / suspected cause / impact:** An unparseable date is treated as "no match". A client using the ISO format, the most common one, sees an empty statement and believes there are no transactions.

---

<a id="bug-015"></a>
**ID:** BUG-015
**Title:** Date fields are returned as epoch-millisecond numbers, but the contract declares date-time strings (`Transaction.date`, `LoanResponse.responseDate`)
**Endpoint / area:** every transaction endpoint; `POST /requestLoan` (in scope)
**Environment:** <!-- auto:bug-env:BUG-015 -->public sandbox, 2026-11-24 12:09:47–12:10:30 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541); detected by API run [`2026-11-24T11-16-14Z-api`](../results/kept/2026-11-24T11-16-14Z-api/summary.md)<!-- /auto:bug-env:BUG-015 -->
**Severity:** Medium · **Priority:** P3
**Related test case:** HIST-01, LOAN-01, JRN-01 J13a

**Steps to reproduce:**
1. `GET /accounts/S/transactions` and check the type of `date`.
2. `POST /requestLoan?...` and check the type of `responseDate`.

<!-- auto:bug-result:BUG-015 -->
**Request:**
```
GET /parabank/services/bank/accounts/22557/transactions
POST /parabank/services/bank/requestLoan?customerId=16541&amount=500&downPayment=50&fromAccountId=22557
```

**Actual result:**
```
tested  · Transaction list: type of the date field → 200 [{"id":64981,"accountId":22557,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":65314,"accountId":2…
tested  · LoanResponse.responseDate type (same call as BUG-006) → 200 {"responseDate":1795522229153,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":22890}   22557: 203.01 → 153.01
Stage 3 · LOAN-01: [C1] loanResponse schema (data.responseDate should be string) · [A12] the loan is recorded in the loan account history (found 0)
Stage 3 · HIST-01: [C1] Transaction.date is a date-time string (got number)
Stage 3 · JRN-01 J13a: [C1] loanResponse schema (data.responseDate should be string)
```
<!-- /auto:bug-result:BUG-015 -->

**Expected result:** ISO 8601 strings, as declared in `docs/exercise/02_parabank_openapi.json` (`type: string, format: date-time`). Basis: C1.

**Evidence:**
- `evidence/bugs/BUG-015/repro.md`
- `evidence/bugs/BUG-015/stage3-failures.json` (4 records)
- `Business_Rules.md` C-02

**Notes / suspected cause / impact:**
- The JSON serializer writes dates as timestamps.
- Clients generated from the Swagger file fail to parse responses.
- `Transaction.date` also loses the time of day (always 00:00 UTC), so the intended timezone is unclear (S10).

---

<a id="bug-016"></a>
**ID:** BUG-016
**Title:** `POST /transfer` loses debits when several transfers from the same account run at the same time: the source balance drops less than the money sent, so money is created
**Endpoint / area:** `POST /transfer` (in scope) · effect on `GET /accounts/{id}` balance
**Environment:** <!-- auto:bug-env:BUG-016 -->public sandbox, 2026-11-24 11:41–11:57 UTC; load run [`2026-11-24T11-41-04Z-load`](../results/kept/2026-11-24T11-41-04Z-load/summary.md) (throwaway customer 12656) and isolation run [`2026-11-24T11-55-56Z-load`](../results/kept/2026-11-24T11-55-56Z-load/summary.md) (throwaway customer 14543)<!-- /auto:bug-env:BUG-016 -->. First seen on 2026-11-23/24 in two earlier load runs (32.00 and 16.00 created), which were replaced by this cycle's runs
**Severity:** Critical · **Priority:** P1
**Related test case:** NFR-02 — detected by the load test's reconciliation (L6) after L4 "concurrent transfers"; isolated with a sequential control on a fresh customer

**Steps to reproduce:**
1. Open accounts S and T for one customer; deposit 500.00 into S (with the site's opening amount of 100.00, S starts at 600.00 and T at 100.00).
2. Control: send 5 transfers of 1.00 from S to T **one after another**. S drops 5.00, T rises 5.00.
3. Send 5 transfers of 1.00 from S to T **at the same moment** (5 parallel requests). Repeat a few times, 7.5 s apart.
4. Read `GET /accounts/S`, `GET /accounts/T` and `GET /accounts/S/transactions`.

<!-- auto:bug-result:BUG-016 -->
**Request:**
```
5 × in parallel:
POST /parabank/services/bank/transfer?fromAccountId=17451&toAccountId=17562&amount=1.00
```

**Actual result:**
```
every request: 200 "Successfully transferred $1.00 …"
isolation · control: 5/5 confirmed, S -5.00, T +5.00 → reconciles
isolation · round 1: 5/5 confirmed, S -5.00, T +5.00 → reconciles
isolation · round 2: 5/5 confirmed, S -4.00, T +5.00 → 1.00 not debited from S (S is now 1.00 above the sum of its own transactions)
isolation · round 3: 5/5 confirmed, S -5.00, T +5.00 → reconciles
load run: 111 confirmed transfers → S -96.00, T +111.00 (expected S -111.00) → reconciliation FAIL
balances after each test: L1 gap 0.00 · L2 gap 0.00 · L3 gap 0.00 · L4 gap +15.00 · L5 not started
```
<!-- /auto:bug-result:BUG-016 -->

**Expected result:** S decreases by exactly the confirmed amount and T increases by the same; S + T stays constant; each balance equals the sum of its account's transactions — however many requests arrive at once. Basis: A1 (a transfer takes and adds the same amount), A7 (the same data agrees across endpoints: balance vs. history).

**Evidence:**
- `evidence/bugs/BUG-016/repro.md` (both runs, every snapshot)
- `evidence/bugs/BUG-016/load-reconciliation.json`, `evidence/bugs/BUG-016/isolation.json`
- Load run <!-- auto:run:load -->[`2026-11-24T11-41-04Z-load`](../results/kept/2026-11-24T11-41-04Z-load/summary.md)<!-- /auto:run:load --> (per-test balances) and isolation run <!-- auto:run:isolation -->[`2026-11-24T11-55-56Z-load`](../results/kept/2026-11-24T11-55-56Z-load/summary.md)<!-- /auto:run:isolation -->

**Notes / suspected cause / impact:**
- Classic **lost update**: the debit reads the source balance, subtracts and writes it back without a row lock or atomic update, so parallel requests overwrite each other's debit. The credit side and the transaction rows are written correctly, which is why the history and the balance disagree.
- Intermittent, and only with simultaneous requests: 15 of 80 concurrent transfers in L4 and 1 of 15 in the isolation run lost their debit (earlier runs: 32 of 80, 16 of 80); never with sequential requests (L3, control). Functional tests (always sequential) cannot find it.
- Impact: money is created out of nothing, and an account's balance no longer matches its statement. At realistic traffic (two payments leaving one account together) balances drift silently. Combined with BUG-002 anyone can trigger it on any account.
- Not found: whether deposit, withdraw and bill pay share the problem (not load-tested; same pattern likely).

---

<a id="bug-017"></a>
**ID:** BUG-017
**Title:** `sellPosition` accepts selling more shares than the position holds: the position goes negative and the sale price is credited, so money is created
**Endpoint / area:** `POST /customers/{customerId}/sellPosition` (extended) · effect on the account balance and `GET /positions/{positionId}`
**Environment:** <!-- auto:bug-env:BUG-017 -->public sandbox, 2026-11-24 12:10:48–12:11:00 UTC; reproduction run [`2026-11-24T12-07-32Z-repro`](../results/kept/2026-11-24T12-07-32Z-repro/summary.md) on throwaway user qa_s4_mwungyju (customer 16541)<!-- /auto:bug-env:BUG-017 -->
**Severity:** Critical · **Priority:** P1
**Related test case:** Stage 1 exploration E-INV1 (no suite case: buy/sell is an extended endpoint, covered only by the journey's normal buy and sell, J14–J15)

**Steps to reproduce:**
1. Control: `POST /customers/{id}/buyPosition?accountId=A&name=QA Test Stock&symbol=QATS&shares=2&pricePerShare=10` → 200, A −20.00, position with 2 shares.
2. Control: `POST /customers/{id}/sellPosition?accountId=A&positionId=P&shares=1&pricePerShare=12` → 200, A +12.00, 1 share left.
3. `POST /customers/{id}/sellPosition?accountId=A&positionId=P&shares=100&pricePerShare=10` (the position holds 1 share).
4. `GET /positions/P`.

<!-- auto:bug-result:BUG-017 -->
**Request:**
```
POST /parabank/services/bank/customers/16541/sellPosition?accountId=22446&positionId=13128&shares=100&pricePerShare=10
```

**Actual result:**
```
control · Control: buy 2 shares × 10.00 from A → 200 [{"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":2,"purchasePrice":10.0000}]   22446: 215.50 → 195.50
control · Control: sell 1 share × 12.00 to A → 200 [{"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":1,"purchasePrice":10.0000}]   22446: 195.50 → 207.50
tested  · Sell 100 shares × 10.00 (the position holds 1) → 200 [{"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":-99,"purchasePrice":10.0000}]   22446: 207.50 → 1207.50
read    · Position after the oversell → 200 {"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":-99,"purchasePrice":10.0000}
```
<!-- /auto:bug-result:BUG-017 -->

**Expected result:** Rejected (4xx, "not enough shares"); the position keeps 1 share and the account is unchanged. Basis: A4 (you can't take out more than you hold, here shares) and A1 (money moves only between real holdings: a sale credits only the value of shares actually owned).

**Evidence:**
- `evidence/bugs/BUG-017/repro.md`
- `evidence/exploration/observations.md` (probe E-INV1)

**Notes / suspected cause / impact:**
- No check of the shares held before a sale; the share count is simply decremented.
- Any customer can credit any amount to their account by "selling" shares they don't own: money is created from nothing. With BUG-002 this works on any customer's position.
- Found only because the exploration now runs on a healthy throwaway customer: in the first exploration this probe ran after the 0.005 transfer had broken the account, so it only returned 500 and stayed on the "to verify" list.

---

# Spec ambiguities and contradictions

| # | Where | What is unclear or contradictory | Question for product/R&D |
|---|---|---|---|
| S1 | Swagger (no security scheme) vs banking norm | The API needs no login at all (BUG-002) | Is the REST API meant to require authentication? Which mechanism? |
| S2 | Transfer / withdraw / bill pay / loan | No overdraft policy anywhere; the API allows unlimited overdraft (BUG-004, BUG-005) | Is any overdraft allowed, and how much? Per account or per customer? |
| S3 | All amount parameters (Swagger: `number`) | Zero, negative and 3-decimal amounts are accepted (BUG-001, BUG-003, BUG-010) | Valid range and precision of amounts? |
| S4 | `POST /transfer` | Transfer to the same account is accepted (BUG-011) | Should it be blocked? |
| S5 | `POST /billpay` (Swagger: Payee has no required fields) vs the web UI form (all required) | Empty payee accepted (BUG-007) | Which payee fields are required? |
| S6 | `POST /transfer` | The same transfer submitted twice is booked twice, with no warning (TRF-08) | Should duplicate submissions be detected (idempotency key, time window)? |
| S7 | `POST /requestLoan` | Isolated in `evidence/bugs/S-LOAN/repro.md` on fresh user L. With the source account holding 50.00 and a down payment of 10: **denied** ("error.insufficient.funds.for.down.payment") while another account made the customer's total negative; **approved** once the total was positive. The down payment is then debited from the source account alone (BUG-005). The loan account gets a balance but no transaction (BUG-006) | What decides approval: source account, customer total, or loan provider rules? How should an approved loan appear (balance, disbursement, transactions)? Is the error message meant for end users? |
| S8 | `POST /requestLoan` | A down payment larger than the loan amount (LOAN-03) was denied as "insufficient funds" | Is down payment > loan amount valid? |
| S9 | Month/type filter | Swagger gives no allowed values; only `Credit`, `Debit`, `All` (case-sensitive) work (BUG-013) | Allowed type values and case rules? |
| S10 | Date filters, `Transaction.date` | Swagger gives no format; only `MM-dd-yyyy` works (BUG-014); dates are epoch ms at 00:00 UTC; contract says date-time strings (BUG-015) | Date format, timezone, and type of date fields? |
| S11 | Error responses (Swagger: only `default`) | Errors come back as plain text, HTML pages, empty 404s or 500s | Which status codes and error body format should clients expect? |
| S12 | `POST /createAccount` | An opening amount is moved from the source account (100.00, but 200.00 in one run on 2026-11-24); the response shows 0 (BUG-009) | What is the opening amount, who configures it, and should it be documented and shown in the response? |
| S13 | `POST /customers/update/{id}` | All fields are required; a missing field gives 500 (Stage 1, E-PRF1) | Is partial update intended? Which fields are required? |
| S16 | `POST /customers/{id}/sellPosition`, `buyPosition` | No validation rules are documented for shares or prices; overselling is accepted (BUG-017) | Which limits apply to shares and prices (owned shares, positive values, market price)? |
| S14 | Swagger login summary | The documentation publishes demo credentials `john/demo` (`Business_Rules.md` C-05) | Intended for the public demo only? |
| S15 | Performance | No SLAs exist; we proposed reads p95 ≤ 1 s, writes p95 ≤ 1.5 s (STD §4) | Are these acceptable, or are there official targets? |
