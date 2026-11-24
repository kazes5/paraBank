# Load test — run 2026-11-24T07-44-12Z-load

Plan: `tests/load/load_test_plan.md` · customer `qa_load_mwue2bh3` (throwaway, 33746) · S 45756 → T 45867 · k6 from one client, latency = `http_req_duration` (client side, includes network and Cloudflare).

## Results per test

p95 verdict only where n ≥ 20. Growth = p95 / baseline p95 (L1 for reads, L3 for transfers). Errors = HTTP errors, timeouts and failed body checks (429 counted separately).

| Test | Endpoint | n | Rate (req/s) | p50 | p90 | p95 | max | Errors % | Timeouts | 429 | p95 target | Growth | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | `GET /accounts/{id}` | 61 | 0.68 | 243 | 316 | 320 | 741 | 0 | 0 | 0 | 1000 | — | **PASS** |
| L2 | `GET /accounts/{id}` | 231 | 1.3 | 277 | 364 | 415 | 698 | 0 | 0 | 0 | 1000 | 1.3 | **PASS** |
| L2 step 1 | `GET /accounts/{id}` | 29 | 0.7 | 260 | 387 | 420 | 698 | 0 | 0 | 0 | 1000 | 1.31 | **PASS** |
| L2 step 2 | `GET /accounts/{id}` | 45 | 1.02 | 273 | 391 | 399 | 445 | 0 | 0 | 0 | 1000 | 1.25 | **PASS** |
| L2 step 3 | `GET /accounts/{id}` | 68 | 1.52 | 273 | 362 | 403 | 446 | 0 | 0 | 0 | 1000 | 1.26 | **PASS** |
| L2 step 4 | `GET /accounts/{id}` | 89 | 2.02 | 282 | 369 | 415 | 444 | 0 | 0 | 0 | 1000 | 1.3 | **PASS** |
| L3 | `POST /transfer` | 31 | 0.52 | 263 | 346 | 436 | 802 | 0 | 0 | 0 | 1500 | — | **PASS** |
| L4 | `POST /transfer` | 80 | 0.71 | 248 | 313 | 574 | 683 | 0 | 0 | 0 | 1500 | 1.32 | **PASS** |
| L5 | `POST /transfer` | 40 | 0.34 | 285 | 347 | 396 | 747 | 0 | 0 | 0 | 1500 | 0.91 | **PASS** |
| L5 | `GET /accounts/{id}` | 121 | 1.01 | 290 | 349 | 357 | 748 | 0 | 0 | 0 | 1000 | 1.12 | **PASS** |

| Test | k6 exit | Stopped by a stop rule | Transfers confirmed | Transfers unsure | Failed checks |
|---|---|---|---|---|---|
| L1 | 0 | no | 0 | 0 | — |
| L2 | 0 | no | 0 | 0 | — |
| L3 | 0 | no | 31 | 0 | — |
| L4 | 0 | no | 80 | 0 | — |
| L5 | 0 | no | 40 | 0 | — |

## L6 — reconciliation and after-load checks

Before: S 600.00 (2 trx), T 100.00 (1 trx) · After: S 481.00 (153 trx), T 251.00 (152 trx)

| Check | Expected | Actual | Result |
|---|---|---|---|
| S decreased by successful transfers × 1.00 | -151.00 | -119.00 | **MISMATCH** |
| T increased by successful transfers × 1.00 | 151.00 | 151.00 | **MATCH** |
| S + T unchanged | 0.00 | 32.00 | **MISMATCH** |
| S transactions added | 151 | 151 | **MATCH** |
| T transactions added | 151 | 151 | **MATCH** |

Reconciliation: **FAIL** · smoke after load: **PASS**

## Analysis (Stage 5)

**Verdict:** speed **PASS**, correctness **FAIL** → NFR-02 **FAIL** (load_test_plan.md §6: any reconciliation mismatch is a FAIL and a Critical defect).

**Speed:** every test met its SLA with a wide margin.
- Reads p95: 320 ms at 0.68 req/s (L1), 415 ms at 2 req/s (L2 step 4). That is 1.3× the baseline, under the 1.5× growth limit and far from the 1000 ms target.
- Transfers p95: 436 ms sequential (L3), 574 ms with 5 at once (L4). That is 1.32× the baseline, against a 1500 ms target.
- 0 errors, 0 timeouts and **0 × HTTP 429** in 564 requests. Cloudflare's limit was not reached at 2 req/s.

**Correctness: money was created under concurrency.**
- 151 transfers of 1.00 were confirmed, and T received all 151, but S went down by only 119.00.
- S's own history (151 debits) adds up to 449.00, while its balance reads 481.00. That is 32.00 of debits that never reached the balance.
- An isolation run on a fresh customer reproduced it: sequential transfers reconcile, while 5 simultaneous ones lost a debit. Filed as **BUG-016** (Critical).

**Suspected bottlenecks:**
- **Latency:** no latency bottleneck appeared at these rates. p95 growth was flat from step 1 to step 4 of L2 (1.31 → 1.30), so the read path is not saturated at 2 req/s.
- **Write path:** in L4, p95 rose to 574 ms while p50 stayed at 248 ms. The 5th request in a round waits for the others, which points to serialised writes on the shared account rows, or queueing in the app.
- **Locking:** the lost debits suggest the balance update is *not* properly locked. The queueing is probably the connection or thread pool, not a row lock.

**What this run cannot tell us** (load_test_plan.md §7):
- the server's capacity limit, because 2 req/s from one IP is far below it;
- server-side causes, because there is no access to CPU, the database or logs;
- whether deposit, withdraw and bill pay also lose updates, because only transfer was load-tested.

This run took no balance snapshot between tests. The second run `results/kept/2026-11-24T08-22-10Z-load` records one after every test: the gap appears only in L4 (+16.00), while L3 and L5 reconcile exactly.
