# Test runs

Every run, newest first. **Kept** runs are committed under `results/kept/`; the others live only on the machine that ran them (`results/runs/`, git-ignored).
Keep a run with `./run.sh keep <runId>`. Regenerated automatically after every run.

| Run | Kind | Scope | User | Result | Kept | Summary |
|---|---|---|---|---|---|---|
| 2026-11-23T17-26-27Z-repro | repro | all defects | — | bundles 16 | local | [summary](runs/2026-11-23T17-26-27Z-repro/summary.md) |
| 2026-11-23T17-26-14Z-manual | manual | AUTH-03 | Rktest2 | FAIL 1 | local | [summary](runs/2026-11-23T17-26-14Z-manual/summary.md) |
| 2026-11-23T17-25-41Z-ui | ui | cross-check of 2026-11-23T17-20-52Z-api | Rktest2 | MATCH 24 · RULE NOT MET 1 | local | [summary](runs/2026-11-23T17-25-41Z-ui/summary.md) |
| 2026-11-23T17-20-52Z-api | api | all | Rktest2 | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-23T17-20-52Z-api/summary.md) |
| 2026-11-23T17-20-30Z-api | api | smoke | Rktest2 | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-23T17-20-30Z-api/summary.md) |
| 2026-11-23T16-35-57Z-manual | manual | AUTH-03, AUTH-05, TRF-08, TRF-09 | Rktest2 | FAIL 2 · BLOCKED 1 · NEEDS-CLARIFICATION 1 | yes | [summary](kept/2026-11-23T16-35-57Z-manual/summary.md) |
| 2026-11-23T16-30-07Z-ui | ui | cross-check of 2026-11-23T16-04-00Z-api | Rktest2 | MATCH 24 · RULE NOT MET 1 | yes | [summary](kept/2026-11-23T16-30-07Z-ui/summary.md) |
| 2026-11-23T16-04-00Z-api | api | all | Rktest2 | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-23T16-04-00Z-api/summary.md) |
