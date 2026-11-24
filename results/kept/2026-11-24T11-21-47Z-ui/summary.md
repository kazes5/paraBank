# Web UI cross-check — run 2026-11-24T11-21-47Z-ui

Run at 2026-11-24T11:22:15.564Z as <USERNAME> (customer 18317) with local Chrome via Playwright; each UI page was compared with the REST API read seconds later.
Accounts from API run `2026-11-24T11-16-14Z-api`: A 22557 (default), B 28218 (journey savings), L 28329 (journey loan), S 26886 / T 26997 (TRF suite).

**24 of 25 checks match; UI/API mismatches: 0.** Results: MATCH, MISMATCH (UI and API disagree), RULE NOT MET (both agree, but a proposed rule fails).

| Area | Check | Result | Detail |
|---|---|---|---|
| Overview | same accounts in UI and API | **MATCH** | UI 15, API 15 |
| Overview | every balance equal in UI and API | **MATCH** | 15 accounts compared |
| Account S (26886) | type and balance | **MATCH** | UI CHECKING $0.00, API CHECKING 0 |
| Account S (26886) | same transactions (id, type, amount) | **MATCH** | UI 9 rows, API 9 rows |
| Account S (26886) | same descriptions | **MATCH** | 9 compared |
| Account T (26997) | type and balance | **MATCH** | UI CHECKING $1199.00, API CHECKING 1199 |
| Account T (26997) | same transactions (id, type, amount) | **MATCH** | UI 6 rows, API 6 rows |
| Account T (26997) | same descriptions | **MATCH** | 6 compared |
| Account A (22557) | type and balance | **MATCH** | UI CHECKING $1287.50, API CHECKING 1287.5 |
| Account A (22557) | same transactions (id, type, amount) | **MATCH** | UI 22 rows, API 22 rows |
| Account A (22557) | same descriptions | **MATCH** | 22 compared |
| Account B (28218) | type and balance | **MATCH** | UI SAVINGS $230.00, API SAVINGS 230 |
| Account B (28218) | same transactions (id, type, amount) | **MATCH** | UI 4 rows, API 4 rows |
| Account B (28218) | same descriptions | **MATCH** | 4 compared |
| Account L (28329) | type and balance | **MATCH** | UI LOAN $500.00, API LOAN 500 |
| Account L (28329) | same transactions (id, type, amount) | **MATCH** | UI 0 rows, API 0 rows |
| Account L (28329) | same descriptions | **MATCH** | 0 compared |
| J09 | transfer 50.00 B → A: Debit 50.00 on B visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Sent" #43780 |
| J09 | transfer 50.00 B → A: Credit 50.00 on A visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Received" #43891 |
| J10 | bill payment 30.00 from A to City Utilities: Debit 30.00 on A visible in UI | **MATCH** | 11-24-2026 "Bill Payment to City Utilities" #44002 |
| J13 | loan down payment 50.00 from A: Debit 50.00 on A visible in UI | **MATCH** | 11-24-2026 "Down Payment for Loan # 28329" #44113 |
| TRF-01 | transfer 1.00 S → T: Debit 1.00 on S visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Sent" #38008 |
| TRF-01 | transfer 1.00 S → T: Credit 1.00 on T visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Received" #38119 |
| J13 | loan account shown as LOAN in UI | **MATCH** | UI type LOAN, balance $500.00 |
| J13 | loan recorded in the loan account history (rule A12) | **RULE NOT MET (A12)** | UI and API agree: 0 rows in UI, 0 in API. Same gap as LOAN-01 / J13e, not a UI-only problem |

## What the UI shows

**S — account 26886** · CHECKING · balance $0.00 · available $0.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Received |  | $100.00 | 37675 |
| 11-24-2026 | Funds Transfer Sent | $1.00 |  | 38008 |
| 11-24-2026 | Funds Transfer Sent | $99.00 |  | 38230 |
| 11-24-2026 | Funds Transfer Sent | $1000.00 |  | 38452 |
| 11-24-2026 | Funds Transfer Sent | -$1.00 |  | 38674 |
| 11-24-2026 | Funds Transfer Sent | $0.00 |  | 38896 |
| 11-24-2026 | Funds Transfer Sent | $1.00 |  | 39118 |
| 11-24-2026 | Funds Transfer Received |  | $1.00 | 39229 |
| 11-24-2026 | Deposit via Web Service |  | $999.00 | 39340 |

Screenshot: `screenshots/activity-S-26886.png`

**T — account 26997** · CHECKING · balance $1199.00 · available $1199.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Received |  | $100.00 | 37897 |
| 11-24-2026 | Funds Transfer Received |  | $1.00 | 38119 |
| 11-24-2026 | Funds Transfer Received |  | $99.00 | 38341 |
| 11-24-2026 | Funds Transfer Received |  | $1000.00 | 38563 |
| 11-24-2026 | Funds Transfer Received |  | -$1.00 | 38785 |
| 11-24-2026 | Funds Transfer Received |  | $0.00 | 39007 |

Screenshot: `screenshots/activity-T-26997.png`

**A — account 22557** · CHECKING · balance $1287.50 · available $1287.50

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 28129 |
| 11-24-2026 | Deposit via Web Service |  | $10.00 | 37342 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 37453 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 37564 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 37786 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 39451 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 39562 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 40006 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 40117 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 40894 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 41005 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 41227 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 42004 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 42115 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 42781 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 42892 |
| 11-24-2026 | Funds Transfer Sent | $100.00 |  | 43336 |
| 11-24-2026 | Funds Transfer Received |  | $50.00 | 43891 |
| 11-24-2026 | Bill Payment to City Utilities | $30.00 |  | 44002 |
| 11-24-2026 | Down Payment for Loan # 28329 | $50.00 |  | 44113 |
| 11-24-2026 | Funds Transfer Sent | $20.00 |  | 44224 |
| 11-24-2026 | Funds Transfer Received |  | $12.00 | 44335 |

Screenshot: `screenshots/activity-A-22557.png`

**B — account 28218** · SAVINGS · balance $230.00 · available $230.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Received |  | $100.00 | 43447 |
| 11-24-2026 | Deposit via Web Service |  | $200.00 | 43558 |
| 11-24-2026 | Withdraw via Web Service | $20.00 |  | 43669 |
| 11-24-2026 | Funds Transfer Sent | $50.00 |  | 43780 |

Screenshot: `screenshots/activity-B-28218.png`

**L — account 28329** · LOAN · balance $500.00 · available $500.00

*No transactions shown.*

Screenshot: `screenshots/activity-L-28329.png`

Overview screenshot: `screenshots/overview.png`.
