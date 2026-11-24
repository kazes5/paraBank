# Stage 1 latency baseline

Source: every non-rate-limited request in `observations.json` and `observations-from-E-DEP1.json` (2026-11-23, 12:58–13:07 UTC).
Single client, requests paced 0–1.5 s apart, public shared instance, measured from the client (includes network and CDN). Response time in ms.

| Group | n | min | p50 | p95 | max |
|---|---|---|---|---|---|
| All requests | 74 | 80 | 242 | 378 | 812 |
| Reads (all GET) | 38 | 80 | 241 | 670 | 812 |
| Money writes (transfer, deposit, withdraw, billpay, requestLoan) | 29 | 218 | 244 | 295 | 296 |
| `GET /accounts/{id}` (load-test target) | 3 | 237 | 242 | 271 | 271 |
| `POST /transfer` (load-test target) | 9 | 224 | 246 | 295 | 295 |

Notes: samples are small (p95 of n < 20 is close to the max and only indicative). The two slowest reads (812 ms login, 657 ms customer) were the first calls of a run, likely connection setup.
