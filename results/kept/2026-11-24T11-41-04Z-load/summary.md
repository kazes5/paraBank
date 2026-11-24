# Load test — run 2026-11-24T11-41-04Z-load

Plan: `deliverables/load_test_plan.md` · customer `qa_load_mwumixkk` (throwaway, 12656) · S 14010 → T 14121 · k6 from one client, latency = `http_req_duration` (client side, includes network and Cloudflare).

## Results per test

p95 verdict only where n ≥ 20. Growth = p95 / baseline p95 (L1 for reads, L3 for transfers). Errors = HTTP errors, timeouts and failed body checks (429 counted separately).

| Test | Endpoint | n | Rate (req/s) | p50 | p90 | p95 | max | Errors % | Timeouts | 429 | p95 target | Growth | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | `GET /accounts/{id}` | 61 | 0.68 | 249 | 322 | 336 | 713 | 0 | 0 | 0 | 1000 | — | **PASS** |
| L2 | `GET /accounts/{id}` | 231 | 1.3 | 255 | 330 | 349 | 1387 | 0 | 0 | 0 | 1000 | 1.04 | **PASS** |
| L2 step 1 | `GET /accounts/{id}` | 29 | 0.7 | 251 | 331 | 346 | 687 | 0 | 0 | 0 | 1000 | 1.03 | **PASS** |
| L2 step 2 | `GET /accounts/{id}` | 45 | 1.02 | 260 | 325 | 333 | 352 | 0 | 0 | 0 | 1000 | 0.99 | **PASS** |
| L2 step 3 | `GET /accounts/{id}` | 68 | 1.52 | 251 | 333 | 368 | 411 | 0 | 0 | 0 | 1000 | 1.1 | **PASS** |
| L2 step 4 | `GET /accounts/{id}` | 89 | 2.03 | 258 | 339 | 350 | 1387 | 0 | 0 | 0 | 1000 | 1.04 | **PASS** |
| L3 | `POST /transfer` | 31 | 0.52 | 279 | 348 | 371 | 768 | 0 | 0 | 0 | 1500 | — | **PASS** |
| L4 | `POST /transfer` | 80 | 0.71 | 255 | 326 | 657 | 687 | 0 | 0 | 0 | 1500 | 1.77 | **PASS** |

| Test | k6 exit | Stopped by a stop rule | Transfers confirmed | Transfers unsure | Failed checks |
|---|---|---|---|---|---|
| L1 | 0 | no | 0 | 0 | — |
| L2 | 0 | no | 0 | 0 | — |
| L3 | 0 | no | 31 | 0 | — |
| L4 | 0 | no | 80 | 0 | — |
| L5 | skipped | — | 0 | 0 | — |

## Balances after each test

Each test should move S by −(confirmed transfers) and T by +(confirmed transfers). A gap here shows which test lost or created money.

| After | S | T | Transfers confirmed | S change | T change | Gap (S + T change) |
|---|---|---|---|---|---|---|
| L1 | 600.00 | 100.00 | 0 | 0.00 | 0.00 | 0.00 |
| L2 | 600.00 | 100.00 | 0 | 0.00 | 0.00 | 0.00 |
| L3 | 569.00 | 131.00 | 31 | -31.00 | 31.00 | 0.00 |
| L4 | 504.00 | 211.00 | 80 | -65.00 | 80.00 | **15.00** |

## L6 — reconciliation and after-load checks

Before: S 600.00 (2 trx), T 100.00 (1 trx) · After: S 504.00 (113 trx), T 211.00 (112 trx)

| Check | Expected | Actual | Result |
|---|---|---|---|
| S decreased by successful transfers × 1.00 | -111.00 | -96.00 | **MISMATCH** |
| T increased by successful transfers × 1.00 | 111.00 | 111.00 | **MATCH** |
| S + T unchanged | 0.00 | 15.00 | **MISMATCH** |
| S transactions added | 111 | 111 | **MATCH** |
| T transactions added | 111 | 111 | **MATCH** |

Reconciliation: **FAIL** · smoke after load: **PASS**

## Notes

- L5 not started: L4 left a balance gap of 15.00 (S + T changed) (plan §5: nothing else starts after a wrong balance).
- Session verdict: FAIL (reconciliation FAIL).
