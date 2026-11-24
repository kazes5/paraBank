# BUG-016 — reproduction

Concurrent `POST /transfer` calls from the same account lose debits: the source balance goes down by less than the confirmed transfers, while the target is credited for all of them and every debit appears in the source history.

## 1. Detection — load test L4 (`results/kept/2026-11-24T07-44-12Z-load`)

Throwaway customer 33746, S 45756 → T 45867, every transfer 1.00. L3 = 31 sequential, L4 = 16 rounds of 5 simultaneous, L5 = 40 at 1 per 3 s (2 writers).

| Check | Expected | Actual | Result |
|---|---|---|---|
| S decreased by successful transfers × 1.00 | -151.00 | -119.00 | MISMATCH |
| T increased by successful transfers × 1.00 | 151.00 | 151.00 | MATCH |
| S + T unchanged | 0.00 | 32.00 | MISMATCH |
| S transactions added | 151 | 151 | MATCH |
| T transactions added | 151 | 151 | MATCH |

Read back afterwards: S balance 481.00, but the sum of S's own transactions (2 credits 600.00, 151 debits of 1.00) is 449.00 → 32.00 of debits never reached the balance. T balance 251.00 = sum of its history. This run took no snapshot between tests; the second run (§1b) assigns the losses to L4.

## 1b. Attribution — second load run (`results/kept/2026-11-24T08-22-10Z-load`)

Balances read after each test (customer 45845):

| After | Confirmed transfers | S change | T change | Gap |
|---|---|---|---|---|
| L3 (sequential) | 31 | −31.00 | +31.00 | 0.00 |
| L4 (16 rounds of 5 at once) | 80 | −64.00 | +80.00 | **+16.00** |
| L5 (2 writers, low overlap) | 40 | −40.00 | +40.00 | 0.00 |

All the lost debits come from the test that sends simultaneous transfers.

## 2. Isolation on fresh data (`results/kept/2026-11-24T08-03-30Z-load`)

Throwaway customer 42959, S 58521 → T 58632. Control: 5 sequential transfers (paced 1.5 s). Then 3 rounds of 5 simultaneous transfers, 7.5 s apart. Balances and histories read after each step.

| Step | Sent | Confirmed | S change | T change | S balance − S history | S + T drift |
|---|---|---|---|---|---|---|
| control | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 1 | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 2 | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 3 | 5 | 5 | -4.00 | 5.00 | 1.00 | 1.00 |

Sequential transfers never lose an update; simultaneous ones do, intermittently (L4: 32 of 80; isolation: 1 of 15). Every request returned 200 with the success text.

Request (each of the 5, sent at the same moment):

```
POST /parabank/services/bank/transfer?fromAccountId=58521&toAccountId=58632&amount=1.00
Accept: application/json
→ 200  Successfully transferred $1.00 from account #58521 to account #58632
```

Files: `load-reconciliation.json` (load run), `isolation.json` (isolation run, every snapshot).
