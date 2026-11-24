# Web UI cross-check (Stage 3, step 4)

Run at 2026-11-23T16:30:07.676Z as Rktest2 (customer 37409) with local Chrome via Playwright; each UI page was compared with the REST API read seconds later.
Accounts from the official run `results/kept/2026-11-23T16-04-00Z-api`: A 54192 (default), B 75504 (journey savings), L 75726 (journey loan), S 72174 / T 72285 (TRF suite).

**24 of 25 checks match; UI/API mismatches: 0.** Results: MATCH, MISMATCH (UI and API disagree), RULE NOT MET (both agree, but a proposed rule fails).

| Area | Check | Result | Detail |
|---|---|---|---|
| Overview | same accounts in UI and API | **MATCH** | UI 49, API 49 |
| Overview | every balance equal in UI and API | **MATCH** | 49 accounts compared |
| Account A (54192) | type and balance | **MATCH** | UI CHECKING $4051.50, API CHECKING 4051.5 |
| Account A (54192) | same transactions (id, type, amount) | **MATCH** | UI 80 rows, API 80 rows |
| Account A (54192) | same descriptions | **MATCH** | 80 compared |
| Account B (75504) | type and balance | **MATCH** | UI SAVINGS $230.00, API SAVINGS 230 |
| Account B (75504) | same transactions (id, type, amount) | **MATCH** | UI 4 rows, API 4 rows |
| Account B (75504) | same descriptions | **MATCH** | 4 compared |
| Account L (75726) | type and balance | **MATCH** | UI LOAN $500.00, API LOAN 500 |
| Account L (75726) | same transactions (id, type, amount) | **MATCH** | UI 0 rows, API 0 rows |
| Account L (75726) | same descriptions | **MATCH** | 0 compared |
| Account S (72174) | type and balance | **MATCH** | UI CHECKING $0.00, API CHECKING 0 |
| Account S (72174) | same transactions (id, type, amount) | **MATCH** | UI 9 rows, API 9 rows |
| Account S (72174) | same descriptions | **MATCH** | 9 compared |
| Account T (72285) | type and balance | **MATCH** | UI CHECKING $1199.00, API CHECKING 1199 |
| Account T (72285) | same transactions (id, type, amount) | **MATCH** | UI 6 rows, API 6 rows |
| Account T (72285) | same descriptions | **MATCH** | 6 compared |
| J09 | transfer 50.00 B → A: Debit 50.00 on B visible in UI | **MATCH** | 11-23-2026 "Funds Transfer Sent" #118594 |
| J09 | transfer 50.00 B → A: Credit 50.00 on A visible in UI | **MATCH** | 11-23-2026 "Funds Transfer Received" #118705 |
| J10 | bill payment 30.00 from A to City Utilities: Debit 30.00 on A visible in UI | **MATCH** | 11-23-2026 "Bill Payment to City Utilities" #118816 |
| J13 | loan down payment 50.00 from A: Debit 50.00 on A visible in UI | **MATCH** | 11-23-2026 "Down Payment for Loan # 75726" #118927 |
| TRF-01 | transfer 1.00 S → T: Debit 1.00 on S visible in UI | **MATCH** | 11-23-2026 "Funds Transfer Sent" #110380 |
| TRF-01 | transfer 1.00 S → T: Credit 1.00 on T visible in UI | **MATCH** | 11-23-2026 "Funds Transfer Received" #110491 |
| J13 | loan account shown as LOAN in UI | **MATCH** | UI type LOAN, balance $500.00 |
| J13 | loan recorded in the loan account history (rule A12) | **RULE NOT MET (A12)** | UI and API agree: 0 rows in UI, 0 in API. Same gap as LOAN-01 / J13e, not a UI-only problem |

## What the UI shows

**A — account 54192** · CHECKING · balance $4051.50 · available $4051.50

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 64759 |
| 11-23-2026 | Deposit via Web Service |  | $10.00 | 78412 |
| 11-23-2026 | Deposit via Web Service |  | $10.00 | 79411 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 79522 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 79633 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 79855 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 81409 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 81520 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 81964 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 82075 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 82741 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 82852 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 83074 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 85738 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 85849 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 86293 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 86404 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 87736 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 87847 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 88069 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 89734 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 89845 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 90289 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 90400 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 91177 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 91288 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 91510 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 92731 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 92842 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 94729 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 94840 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 97171 |
| 11-23-2026 | Funds Transfer Received |  | $50.00 | 97948 |
| 11-23-2026 | Bill Payment to City Utilities | $30.00 |  | 98059 |
| 11-23-2026 | Down Payment for Loan # 67623 | $50.00 |  | 98503 |
| 11-23-2026 | Funds Transfer Sent | $20.00 |  | 98614 |
| 11-23-2026 | Funds Transfer Received |  | $12.00 | 98725 |
| 11-23-2026 | Deposit via Web Service |  | $10.00 | 99280 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 99391 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 99502 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 99724 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 101833 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 101944 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 102832 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 103165 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 105496 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 105607 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 105829 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 106606 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 106717 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 108049 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 108160 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 108604 |
| 11-23-2026 | Funds Transfer Received |  | $50.00 | 109159 |
| 11-23-2026 | Bill Payment to City Utilities | $30.00 |  | 109270 |
| 11-23-2026 | Down Payment for Loan # 71841 | $50.00 |  | 109381 |
| 11-23-2026 | Funds Transfer Sent | $20.00 |  | 109492 |
| 11-23-2026 | Funds Transfer Received |  | $12.00 | 109603 |
| 11-23-2026 | Deposit via Web Service |  | $10.00 | 109714 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 109825 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 109936 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 110158 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 111823 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 111934 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 112378 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 112600 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 113377 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 113488 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 113710 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 115597 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 115708 |
| 11-23-2026 | Deposit via Web Service |  | $300.00 | 117262 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 117373 |
| 11-23-2026 | Funds Transfer Sent | $100.00 |  | 118150 |
| 11-23-2026 | Funds Transfer Received |  | $50.00 | 118705 |
| 11-23-2026 | Bill Payment to City Utilities | $30.00 |  | 118816 |
| 11-23-2026 | Down Payment for Loan # 75726 | $50.00 |  | 118927 |
| 11-23-2026 | Funds Transfer Sent | $20.00 |  | 119038 |
| 11-23-2026 | Funds Transfer Received |  | $12.00 | 119149 |
| 11-23-2026 | Deposit via Web Service |  | $10.00 | 126253 |

Screenshot: `screenshots/activity-A-54192.png`

**B — account 75504** · SAVINGS · balance $230.00 · available $230.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-23-2026 | Funds Transfer Received |  | $100.00 | 118261 |
| 11-23-2026 | Deposit via Web Service |  | $200.00 | 118372 |
| 11-23-2026 | Withdraw via Web Service | $20.00 |  | 118483 |
| 11-23-2026 | Funds Transfer Sent | $50.00 |  | 118594 |

Screenshot: `screenshots/activity-B-75504.png`

**L — account 75726** · LOAN · balance $500.00 · available $500.00

*No transactions shown.*

Screenshot: `screenshots/activity-L-75726.png`

**S — account 72174** · CHECKING · balance $0.00 · available $0.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-23-2026 | Funds Transfer Received |  | $100.00 | 110047 |
| 11-23-2026 | Funds Transfer Sent | $1.00 |  | 110380 |
| 11-23-2026 | Funds Transfer Sent | $99.00 |  | 110602 |
| 11-23-2026 | Funds Transfer Sent | $1000.00 |  | 110824 |
| 11-23-2026 | Funds Transfer Sent | -$1.00 |  | 111046 |
| 11-23-2026 | Funds Transfer Sent | $0.00 |  | 111268 |
| 11-23-2026 | Funds Transfer Sent | $1.00 |  | 111490 |
| 11-23-2026 | Funds Transfer Received |  | $1.00 | 111601 |
| 11-23-2026 | Deposit via Web Service |  | $999.00 | 111712 |

Screenshot: `screenshots/activity-S-72174.png`

**T — account 72285** · CHECKING · balance $1199.00 · available $1199.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-23-2026 | Funds Transfer Received |  | $100.00 | 110269 |
| 11-23-2026 | Funds Transfer Received |  | $1.00 | 110491 |
| 11-23-2026 | Funds Transfer Received |  | $99.00 | 110713 |
| 11-23-2026 | Funds Transfer Received |  | $1000.00 | 110935 |
| 11-23-2026 | Funds Transfer Received |  | -$1.00 | 111157 |
| 11-23-2026 | Funds Transfer Received |  | $0.00 | 111379 |

Screenshot: `screenshots/activity-T-72285.png`

Overview screenshot: `screenshots/overview.png`.
