# Test runs

Every run, newest first. **Kept** runs are committed under `results/kept/`; the others live only on the machine that ran them (`results/runs/`, git-ignored).
Keep a run with `./run.sh keep <runId>`. Regenerated automatically after every run.

| Run | Kind | Scope | User | Result | Kept | Summary |
|---|---|---|---|---|---|---|
| 2026-11-24T08-52-39Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T08-52-39Z-report/summary.md) |
| 2026-11-24T08-52-07Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T08-52-07Z-report/summary.md) |
| 2026-11-24T08-50-55Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T08-50-55Z-report/summary.md) |
| 2026-11-24T08-40-54Z-api | api | smoke | Rktest2 | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T08-40-54Z-api/summary.md) |
| 2026-11-24T08-22-10Z-load | load | L1–L6 | — | PASS 6 · RECON FAIL 1 | yes | [summary](kept/2026-11-24T08-22-10Z-load/summary.md) |
| 2026-11-24T08-21-53Z-api | api | smoke | Rktest2 | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T08-21-53Z-api/summary.md) |
| 2026-11-24T08-03-30Z-load | load | concurrency isolation | — | lost updates (1.00 each) 1 | yes | [summary](kept/2026-11-24T08-03-30Z-load/summary.md) |
| 2026-11-24T08-02-18Z-api | api | smoke | Rktest2 | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T08-02-18Z-api/summary.md) |
| 2026-11-24T07-44-12Z-load | load | L1–L6 | — | PASS 6 · RECON FAIL 1 | yes | [summary](kept/2026-11-24T07-44-12Z-load/summary.md) |
| 2026-11-24T07-43-57Z-api | api | smoke | Rktest2 | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T07-43-57Z-api/summary.md) |
| 2026-11-24T07-43-10Z-api | api | smoke | Rktest2 | FAIL 6 · BLOCKED 35 · NOT RUN 5 | local | [summary](runs/2026-11-24T07-43-10Z-api/summary.md) |
| 2026-11-24T07-41-48Z-load | load | dry run | — | RECON FAIL 1 | local | [summary](runs/2026-11-24T07-41-48Z-load/summary.md) |
| 2026-11-23T17-26-27Z-repro | repro | all defects | — | bundles 16 | local | [summary](runs/2026-11-23T17-26-27Z-repro/summary.md) |
| 2026-11-23T17-26-14Z-manual | manual | AUTH-03 | Rktest2 | FAIL 1 | local | [summary](runs/2026-11-23T17-26-14Z-manual/summary.md) |
| 2026-11-23T17-25-41Z-ui | ui | cross-check of 2026-11-23T17-20-52Z-api | Rktest2 | MATCH 24 · RULE NOT MET 1 | local | [summary](runs/2026-11-23T17-25-41Z-ui/summary.md) |
| 2026-11-23T17-20-52Z-api | api | all | Rktest2 | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-23T17-20-52Z-api/summary.md) |
| 2026-11-23T17-20-30Z-api | api | smoke | Rktest2 | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-23T17-20-30Z-api/summary.md) |
| 2026-11-23T16-35-57Z-manual | manual | AUTH-03, AUTH-05, TRF-08, TRF-09 | Rktest2 | FAIL 2 · BLOCKED 1 · NEEDS-CLARIFICATION 1 | yes | [summary](kept/2026-11-23T16-35-57Z-manual/summary.md) |
| 2026-11-23T16-30-07Z-ui | ui | cross-check of 2026-11-23T16-04-00Z-api | Rktest2 | MATCH 24 · RULE NOT MET 1 | yes | [summary](kept/2026-11-23T16-30-07Z-ui/summary.md) |
| 2026-11-23T16-04-00Z-api | api | all | Rktest2 | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-23T16-04-00Z-api/summary.md) |
