# Test runs

Every run, newest first. **Kept** runs are committed under `results/kept/`; the others live only on the machine that ran them (`results/runs/`, git-ignored).
Keep a run with `./run.sh keep <runId>`. Regenerated automatically after every run.

| Run | Kind | Scope | User | Result | Kept | Summary |
|---|---|---|---|---|---|---|
| 2026-11-24T12-07-32Z-repro | repro | all defects (published) | — | bundles 17 | yes | [summary](kept/2026-11-24T12-07-32Z-repro/summary.md) |
| 2026-11-24T11-55-56Z-load | load | concurrency isolation | — | lost updates (1.00 each) 1 | yes | [summary](kept/2026-11-24T11-55-56Z-load/summary.md) |
| 2026-11-24T11-55-39Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T11-55-39Z-api/summary.md) |
| 2026-11-24T11-41-04Z-load | load | L1–L6 | — | PASS 4 · RECON FAIL 1 | yes | [summary](kept/2026-11-24T11-41-04Z-load/summary.md) |
| 2026-11-24T11-40-48Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T11-40-48Z-api/summary.md) |
| 2026-11-24T11-25-15Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T11-25-15Z-api/summary.md) |
| 2026-11-24T11-23-02Z-auto | auto | pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 | <USERNAME> | PASSED 4 · XFAIL 2 | yes | [summary](kept/2026-11-24T11-23-02Z-auto/summary.md) |
| 2026-11-24T11-22-15Z-manual | manual | AUTH-03, AUTH-05, TRF-08, TRF-09 | <USERNAME> | FAIL 2 · BLOCKED 1 · NEEDS-CLARIFICATION 1 | yes | [summary](kept/2026-11-24T11-22-15Z-manual/summary.md) |
| 2026-11-24T11-21-47Z-ui | ui | cross-check of 2026-11-24T11-16-14Z-api | <USERNAME> | MATCH 24 · RULE NOT MET 1 | yes | [summary](kept/2026-11-24T11-21-47Z-ui/summary.md) |
| 2026-11-24T11-16-14Z-api | api | all | <USERNAME> | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-24T11-16-14Z-api/summary.md) |
