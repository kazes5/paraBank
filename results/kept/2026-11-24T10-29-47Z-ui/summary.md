# Web UI cross-check — run 2026-11-24T10-29-47Z-ui

Run at 2026-11-24T10:30:18.584Z as <USERNAME> (customer 13877) with local Chrome via Playwright; each UI page was compared with the REST API read seconds later.
Accounts from API run `2026-11-24T10-25-10Z-api`: A 15564 (default), B 18339 (journey savings), L 18450 (journey loan), S 16008 / T 16119 (TRF suite).

**24 of 25 checks match; UI/API mismatches: 0.** Results: MATCH, MISMATCH (UI and API disagree), RULE NOT MET (both agree, but a proposed rule fails).

| Area | Check | Result | Detail |
|---|---|---|---|
| Overview | same accounts in UI and API | **MATCH** | UI 15, API 15 |
| Overview | every balance equal in UI and API | **MATCH** | 15 accounts compared |
| Account S (16008) | type and balance | **MATCH** | UI CHECKING $0.00, API CHECKING 0 |
| Account S (16008) | same transactions (id, type, amount) | **MATCH** | UI 9 rows, API 9 rows |
| Account S (16008) | same descriptions | **MATCH** | 9 compared |
| Account T (16119) | type and balance | **MATCH** | UI CHECKING $1399.00, API CHECKING 1399 |
| Account T (16119) | same transactions (id, type, amount) | **MATCH** | UI 6 rows, API 6 rows |
| Account T (16119) | same descriptions | **MATCH** | 6 compared |
| Account A (15564) | type and balance | **MATCH** | UI CHECKING $287.50, API CHECKING 287.5 |
| Account A (15564) | same transactions (id, type, amount) | **MATCH** | UI 22 rows, API 22 rows |
| Account A (15564) | same descriptions | **MATCH** | 22 compared |
| Account B (18339) | type and balance | **MATCH** | UI SAVINGS $330.00, API SAVINGS 330 |
| Account B (18339) | same transactions (id, type, amount) | **MATCH** | UI 4 rows, API 4 rows |
| Account B (18339) | same descriptions | **MATCH** | 4 compared |
| Account L (18450) | type and balance | **MATCH** | UI LOAN $500.00, API LOAN 500 |
| Account L (18450) | same transactions (id, type, amount) | **MATCH** | UI 0 rows, API 0 rows |
| Account L (18450) | same descriptions | **MATCH** | 0 compared |
| J09 | transfer 50.00 B → A: Debit 50.00 on B visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Sent" #27130 |
| J09 | transfer 50.00 B → A: Credit 50.00 on A visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Received" #27241 |
| J10 | bill payment 30.00 from A to City Utilities: Debit 30.00 on A visible in UI | **MATCH** | 11-24-2026 "Bill Payment to City Utilities" #27574 |
| J13 | loan down payment 50.00 from A: Debit 50.00 on A visible in UI | **MATCH** | 11-24-2026 "Down Payment for Loan # 18450" #27907 |
| TRF-01 | transfer 1.00 S → T: Debit 1.00 on S visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Sent" #18694 |
| TRF-01 | transfer 1.00 S → T: Credit 1.00 on T visible in UI | **MATCH** | 11-24-2026 "Funds Transfer Received" #18805 |
| J13 | loan account shown as LOAN in UI | **MATCH** | UI type LOAN, balance $500.00 |
| J13 | loan recorded in the loan account history (rule A12) | **RULE NOT MET (A12)** | UI and API agree: 0 rows in UI, 0 in API. Same gap as LOAN-01 / J13e, not a UI-only problem |

## What the UI shows

**S — account 16008** · CHECKING · balance $0.00 · available $0.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Received |  | $200.00 | 18139 |
| 11-24-2026 | Funds Transfer Sent | $1.00 |  | 18694 |
| 11-24-2026 | Funds Transfer Sent | $199.00 |  | 19138 |
| 11-24-2026 | Funds Transfer Sent | $1000.00 |  | 19360 |
| 11-24-2026 | Funds Transfer Sent | -$1.00 |  | 19582 |
| 11-24-2026 | Funds Transfer Sent | $0.00 |  | 19804 |
| 11-24-2026 | Funds Transfer Sent | $1.00 |  | 20026 |
| 11-24-2026 | Funds Transfer Received |  | $1.00 | 20137 |
| 11-24-2026 | Deposit via Web Service |  | $999.00 | 20248 |

Screenshot: `screenshots/activity-S-16008.png`

**T — account 16119** · CHECKING · balance $1399.00 · available $1399.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Received |  | $200.00 | 18361 |
| 11-24-2026 | Funds Transfer Received |  | $1.00 | 18805 |
| 11-24-2026 | Funds Transfer Received |  | $199.00 | 19249 |
| 11-24-2026 | Funds Transfer Received |  | $1000.00 | 19471 |
| 11-24-2026 | Funds Transfer Received |  | -$1.00 | 19693 |
| 11-24-2026 | Funds Transfer Received |  | $0.00 | 19915 |

Screenshot: `screenshots/activity-T-16119.png`

**A — account 15564** · CHECKING · balance $287.50 · available $287.50

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 17140 |
| 11-24-2026 | Deposit via Web Service |  | $10.00 | 17584 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 17917 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 18028 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 18250 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 20359 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 20470 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 20914 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 21025 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 23356 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 23467 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 23689 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 24466 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 24577 |
| 11-24-2026 | Deposit via Web Service |  | $300.00 | 25243 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 25354 |
| 11-24-2026 | Funds Transfer Sent | $200.00 |  | 26464 |
| 11-24-2026 | Funds Transfer Received |  | $50.00 | 27241 |
| 11-24-2026 | Bill Payment to City Utilities | $30.00 |  | 27574 |
| 11-24-2026 | Down Payment for Loan # 18450 | $50.00 |  | 27907 |
| 11-24-2026 | Funds Transfer Sent | $20.00 |  | 28018 |
| 11-24-2026 | Funds Transfer Received |  | $12.00 | 28129 |

Screenshot: `screenshots/activity-A-15564.png`

**B — account 18339** · SAVINGS · balance $330.00 · available $330.00

| Date | Transaction | Debit | Credit | Id |
|---|---|---|---|---|
| 11-24-2026 | Funds Transfer Received |  | $200.00 | 26575 |
| 11-24-2026 | Deposit via Web Service |  | $200.00 | 26908 |
| 11-24-2026 | Withdraw via Web Service | $20.00 |  | 27019 |
| 11-24-2026 | Funds Transfer Sent | $50.00 |  | 27130 |

Screenshot: `screenshots/activity-B-18339.png`

**L — account 18450** · LOAN · balance $500.00 · available $500.00

*No transactions shown.*

Screenshot: `screenshots/activity-L-18450.png`

Overview screenshot: `screenshots/overview.png`.
