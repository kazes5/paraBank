# BUG-016 — concurrent transfers lose debits (money created)

Built from the two kept runs below (copied, not re-measured): the load session that detected it and the isolation run that pinned it to simultaneous requests. Machine-readable copies: `load-reconciliation.json`, `isolation.json`.

## 1. Detection — load run `2026-11-24T11-41-04Z-load` (balances after each test, L6)

### Balances after each test

Each test should move S by −(confirmed transfers) and T by +(confirmed transfers). A gap here shows which test lost or created money.

| After | S | T | Transfers confirmed | S change | T change | Gap (S + T change) |
|---|---|---|---|---|---|---|
| L1 | 600.00 | 100.00 | 0 | 0.00 | 0.00 | 0.00 |
| L2 | 600.00 | 100.00 | 0 | 0.00 | 0.00 | 0.00 |
| L3 | 569.00 | 131.00 | 31 | -31.00 | 31.00 | 0.00 |
| L4 | 504.00 | 211.00 | 80 | -65.00 | 80.00 | **15.00** |

### L6 — reconciliation and after-load checks

Before: S 600.00 (2 trx), T 100.00 (1 trx) · After: S 504.00 (113 trx), T 211.00 (112 trx)

| Check | Expected | Actual | Result |
|---|---|---|---|
| S decreased by successful transfers × 1.00 | -111.00 | -96.00 | **MISMATCH** |
| T increased by successful transfers × 1.00 | 111.00 | 111.00 | **MATCH** |
| S + T unchanged | 0.00 | 15.00 | **MISMATCH** |
| S transactions added | 111 | 111 | **MATCH** |
| T transactions added | 111 | 111 | **MATCH** |

Reconciliation: **FAIL** · smoke after load: **PASS**


## 2. Isolation — run `2026-11-24T11-55-56Z-load` (fresh throwaway customer, sequential control first)

Throwaway customer 14543; S 17451 (start 600.00), T 17562 (start 100.00). Every transfer is 1.00 S → T.

| Step | Transfers sent | Confirmed (200 + success text) | S balance change | T balance change | S balance − sum of S history | S + T drift since start |
|---|---|---|---|---|---|---|
| control | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 1 | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 2 | 5 | 5 | -4.00 | 5.00 | 1.00 | 1.00 |
| round 3 | 5 | 5 | -5.00 | 5.00 | 1.00 | 1.00 |

Expected for every step: S change = −confirmed, T change = +confirmed, balance − history = 0.00, drift = 0.00.


Full runs: [load summary](../../../results/kept/2026-11-24T11-41-04Z-load/summary.md) · [isolation summary](../../../results/kept/2026-11-24T11-55-56Z-load/summary.md).
