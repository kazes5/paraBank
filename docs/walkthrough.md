# Walkthrough: from a journey failure to a bug report

A 10-minute demo of the test approach, following one real failure through the three layers:
**customer journey → isolating endpoint suite → reproduction on clean data → bug report**.
Example: the approved loan that never appears in the loan account's history (BUG-006).

## 1. Run the journey

```bash
./run.sh journey            # or on the web page: tick "API tests" and press Run (./run.sh web)
```

The journey JRN-01 walks one customer through J02–J17: log in, open an account, deposit, withdraw, transfer, pay a bill, read and filter the statement, take a loan, buy and sell a position, update the profile, and reconcile every balance against an expected-state ledger.

**Result:** JRN-01 FAIL, 91 of 94 checks passed. One of the failing checks:

> `J13e [A12] the loan is recorded in the loan account history (found 0)`

Evidence: [`results/kept/2026-11-24T11-16-14Z-api/summary.md`](../results/kept/2026-11-24T11-16-14Z-api/summary.md) (row JRN-01).

## 2. Isolate it with the endpoint suite

A journey failure can come from earlier steps or leftover data. The isolation workflow (plan.md §2.5) re-runs the endpoint on its own, in the suite that owns it, on fresh accounts:

- Suite case **LOAN-01** (loan result matches the accounts) fails the same way: `[A12] the loan is recorded in the loan account history (found 0)`.
- So the defect is in `POST /requestLoan` itself, not in the journey. It is classified in the failure-classification table of [`deliverables/Bug_Reports.md`](../deliverables/Bug_Reports.md#failure-classification-stage-4-exit-gate) (row "JRN-01 J13e").

## 3. Reproduce on clean data, with a control

```bash
./run.sh repro              # every known defect, on fresh throwaway users
```

`repro-defects.mjs` registers a new throwaway user, requests a loan that is approved, then reads the new loan account and its transactions. It records every request, response and balance before and after: [`evidence/bugs/BUG-006/repro.md`](../evidence/bugs/BUG-006/repro.md).

- **Expected (rule A12):** the loan account shows the loan as its first transaction, as every other money movement does.
- **Actual:** the loan account exists with the loan balance, but its transaction list is empty. The web UI shows the same (UI cross-check, activity page of account L).

## 4. The bug report

[`deliverables/Bug_Reports.md` → BUG-006](../deliverables/Bug_Reports.md#bug-006): *Approved loan is not recorded in the loan account's transaction history*. High, P2. It holds the steps to reproduce, expected vs. actual, the request and response, and links to the evidence bundle above.

## 5. Where it lands

- **STR:** counted under the open High defects ([`deliverables/STR.md`](../deliverables/STR.md)); the detailed annex ([`deliverables/STR_Detailed.md`](../deliverables/STR_Detailed.md)) links the evidence.
- **Coded tests:** the pytest journey (`tests/automation/test_journey.py`) marks J13e as known defect BUG-006. When R&D fixes it, that test turns red with "known defect no longer reproduces", which is the signal to retest and close the bug.

## Other good examples to show

| Story | Start | Bug |
|---|---|---|
| Money created under load | `./run.sh load`: L6 reconciliation finds S + T grew; isolation run pins it to 5 simultaneous transfers | BUG-016 (Critical) |
| A negative transfer moves money backwards | Suite case TRF-03 | BUG-003 (Critical) |
| No login needed to read or move money | Suite cases CUST-03, ACCT-04 | BUG-002 (Critical) |
| Selling shares you don't own creates money | Stage 1 exploration probe E-INV1, reproduced next to a normal buy and sell | BUG-017 (Critical) |
