# Load test plan — ParaBank API (Stage 5)

**Exercise task 4:** a basic load and performance test of `GET /accounts/{accountId}` and `POST /transfer`. It defines its own SLAs, runs a baseline and a higher-load scenario, and reports results and suspected bottlenecks.
**Covers:** STD case **NFR-02** and risk **R11** ("the API slows down under load"), plus the data-integrity risk of concurrent money writes.
**Tool:** k6. Scripts go in `tests/load/`, and every run writes `results/runs/<UTC time>-load/`.

---

## 1. What limits the design

| Constraint | Source | Effect on the plan |
|---|---|---|
| ≤ ~20 virtual users, a few minutes per run, nothing that looks like an attack | Exercise instructions | At most **10 VUs**. Each scenario lasts ≤ 3 min, and the whole session about 15 min including pauses |
| Cloudflare blocks one client after **about 60 rapid requests** (HTTP 429, error 1015). A 1.5 s pace (0.67 req/s) never triggered it | `Business_Rules.md` §2 (seen during the first exploration; the paced runner has not triggered it since) | All traffic comes from one IP, so the request **rate** must stay low. The plan raises **concurrency** (requests in flight together) more than **throughput** (requests per second). A 429 is recorded as a CDN limit, never as a ParaBank SLA failure |
| Unloaded latency: reads p95 635 ms and money writes p95 266 ms (exploration); `GET /accounts/{id}` p95 326 ms, `POST /transfer` p95 275 ms in the functional run | `evidence/exploration/latency-baseline.md`; NFR-01 in `results/kept/2026-11-24T11-16-14Z-api/summary.md` | Reference point for the baselines. A baseline far from these values means the site is having a bad day: re-run later |
| Amounts below one cent break accounts (BUG-001); overdraft is unlimited (BUG-004) | `Bug_Reports.md` | Transfers are exactly **1.00**, and the source account is funded so it never goes negative. Results must not depend on either bug |
| The site is shared and resets periodically | STD R9 | Fresh accounts per session. A reset during a run makes that run BLOCKED |

**Concurrency versus throughput:**
- At about 250 ms per request, one request per second almost never overlaps with another, so the server never sees concurrent work.
- To create real contention without a high rate, the transfer test fires **5 requests at the same moment**, then waits. The average rate stays at the safe 0.67 req/s, but the server receives 5 simultaneous writes to the same two accounts.

---

## 2. SLAs (from STD §4, the SLA model)

| Class | Endpoint under load | p95 response time | Error rate | Timeout |
|---|---|---|---|---|
| Read | `GET /accounts/{accountId}` | ≤ 1000 ms | < 1 % | 5 s |
| Write | `POST /transfer` | ≤ 1500 ms | < 1 % | 5 s |

**Why these numbers:**
- **Read:** the unloaded p95 is about 670 ms across all reads, so the target leaves roughly 1.5× headroom.
- **Write:** writes lock database rows and degrade fastest under concurrency, so their target is looser even though they are fast unloaded. There are no official SLAs; the targets are open question 15 in the STD.

**How results are counted:**
- **Error:** an unexpected HTTP status (except 429, see below), a timeout over 5 s, or a failed body check. Example: a 200 whose body is not `Successfully transferred $1.00 …`.
- **429:** counted separately as **rate-limited**. It stops the scenario (see §5) and is reported as an environment limit.
- **p95 verdict:** only for a scenario, or a step, with **≥ 20 completed requests**. Fewer requests means *info only*.
- **Latency:** measured from the client, so it includes the network and Cloudflare.

---

## 3. Test data and fixtures

Each load session prepares its own data, which keeps the reconciliation exact:

1. **Smoke gate:** run `./run.sh smoke`. If it fails, there is no load test (BLOCKED).
2. **Throwaway customer:** register one through the web form, as the repro and manual scripts already do. The load test writes hundreds of transactions, so it keeps the test users' histories readable, and nobody else touches its accounts.
3. **Accounts:** open accounts **S** (source) and **T** (target) from the default account. Deposit 500.00 into S, which covers every planned transfer (at most ~150 × 1.00) without relying on overdraft.
4. **Before snapshot:** record the balances of S and T and their transaction counts.

---

## 4. The tests

| ID | Name | Endpoint | Load | Requests (approx.) |
|---|---|---|---|---|
| **L1** | Read baseline | `GET /accounts/{S}` | 1 VU, 1 request every 1.5 s, 90 s | 60 |
| **L2** | Read step load | `GET /accounts/{S}` | Arrival-rate steps 0.67 → 1 → 1.5 → 2 req/s, 45 s each, up to 10 VUs | 230 |
| **L3** | Transfer baseline | `POST /transfer` S → T, 1.00 | 1 VU, 1 transfer every 2 s, 60 s | 30 |
| **L4** | Concurrent transfers | `POST /transfer` S → T, 1.00 | 5 VUs firing **together** every 7.5 s, 2 min | 80 |
| **L5** | Reads during writes *(optional)* | Both | 3 VUs reading at 1 req/3 s and 2 VUs transferring at 1 per 6 s, 2 min | 160 |
| **L6** | After-load checks | Several | Reconciliation and smoke, run once | ~15 |

A **2-minute pause** separates scenarios so the CDN's rate-limit window resets, and the next scenario starts clean.

Total: about 575 requests, peak 10 VUs, about 15 minutes including pauses.

### L1 — Read baseline
- **What:** one user reads account S every 1.5 s for 90 s.
- **Checks per request:** HTTP 200; JSON `id` equals S; `balance` is a number; `type` is `CHECKING`.
- **Expected result:**
  - p95 ≤ 1000 ms (PASS); in practice expect about 250–350 ms, close to the Stage 1 and NFR-01 values.
  - Errors 0 %, and no 429 (this is the pace proven safe in every functional run).
- **Why:**
  - It is the reference that L2 is compared with.
  - It confirms the SLA is met with no load.
  - It is a fresh measurement at the time of the higher-load run: the site's speed varies by hour, so an old baseline would make the comparison unfair.

### L2 — Read step load (the higher-load read scenario)
- **What:** k6 `ramping-arrival-rate`, so the server receives a fixed rate whatever its speed.
  - The rate rises in four 45 s steps: 0.67, 1, 1.5 and 2 requests/s.
  - k6 adds VUs, up to 10, when responses slow down. That way, rising latency turns into rising concurrency, just as with real users.
- **Checks per request:** as L1.
- **Expected result:**
  - Every completed step: p95 ≤ 1000 ms, errors < 1 %.
  - p95 grows by less than 1.5× over the L1 baseline. These rates are small for a server, so a large growth would point to a bottleneck (a single connection pool, a database lock on reads, or CDN queuing).
  - **Likely:** Cloudflare returns 429 at one of the upper steps. Then the scenario stops at that step; the SLA verdict covers only the completed steps, and the report states the highest rate reached without blocking.
- **Why:**
  - It is the "higher load" scenario for reads that the task asks for.
  - Steps show *where* latency starts to grow, which a single higher level cannot show.
  - The arrival-rate model is used because a fixed-VU loop slows down along with the server and hides the problem.

### L3 — Transfer baseline
- **What:** one user transfers 1.00 from S to T every 2 s for 60 s.
- **Checks per request:**
  - HTTP 200, and the body says `Successfully transferred $1.00 from account #S to account #T`.
  - k6 counts the successful transfers.
- **Expected result:**
  - p95 ≤ 1500 ms (PASS); in practice expect about 250–350 ms.
  - Errors 0 %.
  - Exactly 30 successful transfers, which L6 checks.
- **Why:** it is the write reference for L4, and it confirms the write SLA without contention.

### L4 — Concurrent transfers (the higher-load write scenario)
- **What:** 5 VUs, synchronized:
  - Each one sends one transfer at the same moment, then all of them wait until the next 7.5 s slot, for 2 minutes (16 rounds × 5 = 80 transfers).
  - The average rate is 0.67 req/s, the same safe pace as the functional runs, but every round puts 5 simultaneous writes on the same two account rows.
- **Checks per request:** as L3.
- **Expected result:**
  - p95 ≤ 1500 ms and errors < 1 %.
  - Latency within one round may rise, because the writes queue on the same rows; a p95 several times the L3 baseline is a bottleneck finding even if it stays under the SLA.
  - **Data integrity (the key check, done in L6):**
    - S decreases by exactly the number of successful transfers.
    - T increases by the same amount.
    - The total S + T is unchanged.
    - One transaction is added on each side per successful transfer.
- **Why:**
  - Concurrent writes to the same accounts are the most dangerous load case for a bank. If the service reads a balance, adds to it and writes it back without locking, simultaneous transfers overwrite each other (*lost update*), and money is created or destroyed.
  - Functional tests are sequential and can never find this.
  - It is the "higher load" scenario for writes that the task asks for.

### L5 — Reads during writes *(optional: only if L1–L4 completed without 429)*
- **What:** for 2 minutes:
  - 3 VUs read S at 1 request / 3 s each.
  - 2 VUs transfer 1.00 from S to T at 1 / 6 s each.
  - That is about 1.3 req/s in total.
- **Checks per request:**
  - As L1 and L3.
  - Each balance read for S is ≤ the previous one, because S only goes down during the run.
- **Expected result:**
  - Read p95 stays ≤ 1000 ms and within 1.5× of L1 while the writes run.
  - Write p95 ≤ 1500 ms; errors < 1 %.
  - The balances read for S never go up.
- **Why:** real traffic mixes reads and writes. If writes lock rows, reads of the same account slow down or return a stale or in-between balance. L1–L4 test each endpoint on its own and cannot show this.

### L6 — After-load checks
- **What:**
  1. Read S, T and their transaction lists.
  2. Compare them with the before snapshot and the success counts from L3, L4 and L5.
  3. Run `./run.sh smoke`.
  4. If errors appeared under load, also run `./run.sh suites`, which includes the transfer and account suites.
- **Expected result:**
  - Balance deltas equal the counted transfers × 1.00 exactly.
  - Transaction counts match.
  - Smoke passes.
- **Why:**
  - A fast response proves nothing if the money is wrong, so the load verdict includes correctness.
  - The smoke run shows the site and the test user are still healthy, so the load test did no lasting damage.

---

## 5. Stop rules (safety)

Every scenario stops early, through a k6 threshold with `abortOnFail`, when:
- **any HTTP 429** appears. Do not retry; wait out the pause, and if 429 continues, stop the session for the day;
- the error rate goes over **10 %** after the first 10 requests;
- p95 goes over **5 s**, meaning the site is struggling;
- a balance read after a transfer is clearly wrong. L4/L5 continue to the end, since reconciliation needs the full count, but nothing else starts after them.

The session also stops when the smoke gate fails, either before the run or in L6.

**Session verdict** (in the run's `summary.md` and `run.json`): **FAIL** when reconciliation fails, a test misses its SLA, k6 itself exits with an error (a code other than 0 or the stop-rule abort 99), or the smoke check after the load fails; otherwise PASS. Error rates are judged per endpoint, so in L5 the reads cannot dilute transfer errors. Reconciliation allows unsure transfers (timeout or 5xx) only on top of the confirmed ones: a missing confirmed transfer is always a mismatch.

Never used: the admin endpoints, amounts other than 1.00, accounts other than the throwaway user's S and T, or parallel sessions.

---

## 6. Verdicts and report

| Verdict | When |
|---|---|
| **PASS** | p95 and error rate meet the SLA for the scenario (or for every completed step), and L6 reconciles exactly |
| **FAIL** | SLA missed with ≥ 20 requests, **or** any reconciliation mismatch (a reconciliation mismatch is a Critical defect regardless of speed) |
| **BLOCKED** | 429 or a site outage before 20 requests completed, or a site reset during the run |
| **NEEDS-CLARIFICATION** | Results that depend on the CDN, e.g. 429 at a step: the ParaBank capacity behind it is unknown |

**The report for each scenario or step:**
- requests, rate and VUs;
- p50 / p90 / p95 / max;
- error rate, split into HTTP errors, body-check failures, timeouts and 429;
- the SLA verdict;
- the change from baseline.

On top of that, the report includes the reconciliation table, suspected bottlenecks and limitations. The report is written to `summary.md` in the run folder, and the main numbers are added to `STD.md` (NFR-02) and the STR.

---

## 7. What these tests cannot tell us

- **No capacity numbers:** the rate is capped by our request budget and by Cloudflare, so the tests cannot find the server's breaking point or its throughput limit.
- **One client, one IP:** the results include our network and the CDN. They cannot separate ParaBank's server time from network time, and they say nothing about many users from many places.
- **Shared, public instance:** other people's traffic and the periodic resets add noise that we cannot see or control, and the samples are small (30–230 requests per scenario). A repeat run may differ, so numbers are compared within one session only.
- **No server-side view:** no CPU, memory, database or logs, so a bottleneck can only be *suspected* from latency patterns, never confirmed.
- **Production differs:** a different deployment, data volume and network mean no production SLA can be inferred.

---

## 8. Files and commands

| File | Purpose |
|---|---|
| `tests/load/run-load.mjs` | The session: smoke gate → fixture → L1–L5 with 2-minute pauses and stop rules → L6 |
| `tests/load/setup-load.mjs` | Throwaway customer, S/T accounts, deposit, before/after snapshots (`fixture.json` in the run folder) |
| `tests/load/lib.js` | Shared k6 code: requests with checks, 429 counter, error rate, transfer counters, stop-rule thresholds |
| `tests/load/get_account.k6.js` | L1 and L2 |
| `tests/load/transfer.k6.js` | L3 and L4 |
| `tests/load/mixed.k6.js` | L5 (optional) |
| `tests/load/isolate-concurrency.mjs` | Isolation of a reconciliation gap: 5 sequential transfers (control), then rounds of 5 simultaneous ones, balance vs. history after each (found BUG-016) |
| `tests/load/reconcile.mjs` | Statistics per test and step from k6's raw JSON, SLA verdicts, L6 reconciliation, `summary.md` |

**Commands:**
- `./run.sh load` runs the whole session; `--keep` keeps the run.
- `./run.sh load --dry` sends 2 requests per scenario, with short pauses and no smoke runs, to check the scripts.

The output goes to `results/runs/<UTC>-load/`: `summary.md`, `results.json`, `fixture.json`, `raw/` (k6 JSON, one file per test) and `logs/`. A single test can also be run directly: `k6 run -e TEST=L1 -e S=<id> tests/load/get_account.k6.js`.
