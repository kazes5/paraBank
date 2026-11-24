# Load test — run 2026-11-24T08-22-10Z-load

Plan: `tests/load/load_test_plan.md` · customer `qa_load_mwuff4nh` (throwaway, 45845) · S 62295 → T 62406 · k6 from one client, latency = `http_req_duration` (client side, includes network and Cloudflare).

## Results per test

p95 verdict only where n ≥ 20. Growth = p95 / baseline p95 (L1 for reads, L3 for transfers). Errors = HTTP errors, timeouts and failed body checks (429 counted separately).

| Test | Endpoint | n | Rate (req/s) | p50 | p90 | p95 | max | Errors % | Timeouts | 429 | p95 target | Growth | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | `GET /accounts/{id}` | 61 | 0.68 | 252 | 319 | 338 | 777 | 0 | 0 | 0 | 1000 | — | **PASS** |
| L2 | `GET /accounts/{id}` | 231 | 1.3 | 247 | 327 | 351 | 783 | 0 | 0 | 0 | 1000 | 1.04 | **PASS** |
| L2 step 1 | `GET /accounts/{id}` | 29 | 0.7 | 242 | 349 | 416 | 783 | 0 | 0 | 0 | 1000 | 1.23 | **PASS** |
| L2 step 2 | `GET /accounts/{id}` | 45 | 1.02 | 245 | 313 | 327 | 432 | 0 | 0 | 0 | 1000 | 0.97 | **PASS** |
| L2 step 3 | `GET /accounts/{id}` | 68 | 1.52 | 257 | 335 | 355 | 444 | 0 | 0 | 0 | 1000 | 1.05 | **PASS** |
| L2 step 4 | `GET /accounts/{id}` | 89 | 2.02 | 248 | 321 | 350 | 448 | 0 | 0 | 0 | 1000 | 1.04 | **PASS** |
| L3 | `POST /transfer` | 31 | 0.52 | 256 | 329 | 339 | 673 | 0 | 0 | 0 | 1500 | — | **PASS** |
| L4 | `POST /transfer` | 80 | 0.71 | 269 | 327 | 729 | 736 | 0 | 0 | 0 | 1500 | 2.15 | **PASS** |
| L5 | `GET /accounts/{id}` | 121 | 1.01 | 241 | 314 | 351 | 658 | 0 | 0 | 0 | 1000 | 1.04 | **PASS** |
| L5 | `POST /transfer` | 40 | 0.34 | 240 | 302 | 308 | 563 | 0 | 0 | 0 | 1500 | 0.91 | **PASS** |

| Test | k6 exit | Stopped by a stop rule | Transfers confirmed | Transfers unsure | Failed checks |
|---|---|---|---|---|---|
| L1 | 0 | no | 0 | 0 | — |
| L2 | 0 | no | 0 | 0 | — |
| L3 | 0 | no | 31 | 0 | — |
| L4 | 0 | no | 80 | 0 | — |
| L5 | 0 | no | 40 | 0 | — |

## Balances after each test

Each test should move S by −(confirmed transfers) and T by +(confirmed transfers). A gap here shows which test lost or created money.

| After | S | T | Transfers confirmed | S change | T change | Gap (S + T change) |
|---|---|---|---|---|---|---|
| L1 | 600.00 | 100.00 | 0 | 0.00 | 0.00 | 0.00 |
| L2 | 600.00 | 100.00 | 0 | 0.00 | 0.00 | 0.00 |
| L3 | 569.00 | 131.00 | 31 | -31.00 | 31.00 | 0.00 |
| L4 | 505.00 | 211.00 | 80 | -64.00 | 80.00 | **16.00** |
| L5 | 465.00 | 251.00 | 40 | -40.00 | 40.00 | 0.00 |

## L6 — reconciliation and after-load checks

Before: S 600.00 (2 trx), T 100.00 (1 trx) · After: S 465.00 (153 trx), T 251.00 (152 trx)

| Check | Expected | Actual | Result |
|---|---|---|---|
| S decreased by successful transfers × 1.00 | -151.00 | -135.00 | **MISMATCH** |
| T increased by successful transfers × 1.00 | 151.00 | 151.00 | **MATCH** |
| S + T unchanged | 0.00 | 16.00 | **MISMATCH** |
| S transactions added | 151 | 151 | **MATCH** |
| T transactions added | 151 | 151 | **MATCH** |

Reconciliation: **FAIL** · smoke after load: **PASS**
