# Concurrency isolation — run 2026-11-24T08-03-30Z-load

Throwaway customer 42959; S 58521 (start 600.00), T 58632 (start 100.00). Every transfer is 1.00 S → T.

| Step | Transfers sent | Confirmed (200 + success text) | S balance change | T balance change | S balance − sum of S history | S + T drift since start |
|---|---|---|---|---|---|---|
| control | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 1 | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 2 | 5 | 5 | -5.00 | 5.00 | 0.00 | 0.00 |
| round 3 | 5 | 5 | -4.00 | 5.00 | 1.00 | 1.00 |

Expected for every step: S change = −confirmed, T change = +confirmed, balance − history = 0.00, drift = 0.00.
