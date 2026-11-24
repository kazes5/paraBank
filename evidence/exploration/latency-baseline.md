# Latency baseline (unloaded) — 2026-11-24

Source: the 72 probes of this exploration run (`observations.json`), sent one at a time from one client, 1500 ms apart. Times are client side and include the network and Cloudflare. HTTP 429 never occurred (the run stops on it).

| Class | n | p50 ms | p95 ms | max ms |
|---|---|---|---|---|
| Reads (all GET) | 38 | 227 | 635 | 709 |
| `GET /accounts/{id}` | 3 | 239 | 253 | 253 |
| Money writes (transfer, deposit, withdraw, bill pay) | 21 | 225 | 266 | 270 |
| All writes (POST) | 34 | 228 | 295 | 339 |

Used for the SLA model in deliverables/STD.md §4 (read p95 ≤ 1000 ms, write p95 ≤ 1500 ms) and as the "no load" reference in deliverables/load_test_plan.md.
