# Test runs

Every run, newest first. **Kept** runs are committed under `results/kept/`; the others live only on the machine that ran them (`results/runs/`, git-ignored).
Keep a run with `./run.sh keep <runId>`. Regenerated automatically after every run.

| Run | Kind | Scope | User | Result | Kept | Summary |
|---|---|---|---|---|---|---|
| 2026-11-24T10-32-29Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T10-32-29Z-report/summary.md) |
| 2026-11-24T10-30-26Z-manual | manual | AUTH-03, AUTH-05, TRF-08, TRF-09 | <USERNAME> | FAIL 2 · BLOCKED 1 · NEEDS-CLARIFICATION 1 | yes | [summary](kept/2026-11-24T10-30-26Z-manual/summary.md) |
| 2026-11-24T10-29-47Z-ui | ui | cross-check of 2026-11-24T10-25-10Z-api | <USERNAME> | MATCH 24 · RULE NOT MET 1 | yes | [summary](kept/2026-11-24T10-29-47Z-ui/summary.md) |
| 2026-11-24T10-25-10Z-api | api | all | <USERNAME> | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-24T10-25-10Z-api/summary.md) |
| 2026-11-24T09-56-17Z-api | api | all | <USERNAME> | PASS 18 · FAIL 22 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | local | [summary](runs/2026-11-24T09-56-17Z-api/summary.md) |
| 2026-11-24T09-51-57Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T09-51-57Z-api/summary.md) |
| 2026-11-24T09-48-14Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T09-48-14Z-api/summary.md) |
| 2026-11-24T09-43-57Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T09-43-57Z-report/summary.md) |
| 2026-11-24T09-13-34Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T09-13-34Z-report/summary.md) |
| 2026-11-24T09-10-37Z-auto | auto | pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 | <USERNAME> | PASSED 4 · XFAIL 2 | yes | [summary](kept/2026-11-24T09-10-37Z-auto/summary.md) |
| 2026-11-24T09-04-44Z-auto | auto | pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 | <USERNAME> | PASSED 2 · FAILED 3 | local | [summary](runs/2026-11-24T09-04-44Z-auto/summary.md) |
| 2026-11-24T09-03-52Z-auto | auto | pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 | <USERNAME> | PASSED 2 · FAILED 3 | local | [summary](runs/2026-11-24T09-03-52Z-auto/summary.md) |
| 2026-11-24T09-01-56Z-auto | auto | pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 | <USERNAME> | PASSED 4 · FAILED 1 · XFAIL 1 | local | [summary](runs/2026-11-24T09-01-56Z-auto/summary.md) |
| 2026-11-24T09-01-40Z-auto | auto | pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 | <USERNAME> | PASSED 2 | local | [summary](runs/2026-11-24T09-01-40Z-auto/summary.md) |
| 2026-11-24T08-52-39Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T08-52-39Z-report/summary.md) |
| 2026-11-24T08-52-07Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T08-52-07Z-report/summary.md) |
| 2026-11-24T08-50-55Z-report | report | STR | — | NO-GO 1 · defects 16 · critical 4 · PASS 20 · FAIL 24 · NEEDS-CLARIFICATION 2 · BLOCKED 1 | local | [summary](runs/2026-11-24T08-50-55Z-report/summary.md) |
| 2026-11-24T08-40-54Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T08-40-54Z-api/summary.md) |
| 2026-11-24T08-22-10Z-load | load | L1–L6 | — | PASS 6 · RECON FAIL 1 | yes | [summary](kept/2026-11-24T08-22-10Z-load/summary.md) |
| 2026-11-24T08-21-53Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T08-21-53Z-api/summary.md) |
| 2026-11-24T08-03-30Z-load | load | concurrency isolation | — | lost updates (1.00 each) 1 | yes | [summary](kept/2026-11-24T08-03-30Z-load/summary.md) |
| 2026-11-24T08-02-18Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T08-02-18Z-api/summary.md) |
| 2026-11-24T07-44-12Z-load | load | L1–L6 | — | PASS 6 · RECON FAIL 1 | yes | [summary](kept/2026-11-24T07-44-12Z-load/summary.md) |
| 2026-11-24T07-43-57Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-24T07-43-57Z-api/summary.md) |
| 2026-11-24T07-43-10Z-api | api | smoke | <USERNAME> | FAIL 6 · BLOCKED 35 · NOT RUN 5 | local | [summary](runs/2026-11-24T07-43-10Z-api/summary.md) |
| 2026-11-24T07-41-48Z-load | load | dry run | — | RECON FAIL 1 | local | [summary](runs/2026-11-24T07-41-48Z-load/summary.md) |
| 2026-11-23T17-26-27Z-repro | repro | all defects | — | bundles 16 | local | [summary](runs/2026-11-23T17-26-27Z-repro/summary.md) |
| 2026-11-23T17-26-14Z-manual | manual | AUTH-03 | <USERNAME> | FAIL 1 | local | [summary](runs/2026-11-23T17-26-14Z-manual/summary.md) |
| 2026-11-23T17-25-41Z-ui | ui | cross-check of 2026-11-23T17-20-52Z-api | <USERNAME> | MATCH 24 · RULE NOT MET 1 | local | [summary](runs/2026-11-23T17-25-41Z-ui/summary.md) |
| 2026-11-23T17-20-52Z-api | api | all | <USERNAME> | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-23T17-20-52Z-api/summary.md) |
| 2026-11-23T17-20-30Z-api | api | smoke | <USERNAME> | PASS 6 · NOT RUN 40 | local | [summary](runs/2026-11-23T17-20-30Z-api/summary.md) |
| 2026-11-23T16-35-57Z-manual | manual | AUTH-03, AUTH-05, TRF-08, TRF-09 | <USERNAME> | FAIL 2 · BLOCKED 1 · NEEDS-CLARIFICATION 1 | yes | [summary](kept/2026-11-23T16-35-57Z-manual/summary.md) |
| 2026-11-23T16-30-07Z-ui | ui | cross-check of 2026-11-23T16-04-00Z-api | <USERNAME> | MATCH 24 · RULE NOT MET 1 | yes | [summary](kept/2026-11-23T16-30-07Z-ui/summary.md) |
| 2026-11-23T16-04-00Z-api | api | all | <USERNAME> | PASS 19 · FAIL 21 · NEEDS-CLARIFICATION 1 · NOT RUN 5 | yes | [summary](kept/2026-11-23T16-04-00Z-api/summary.md) |
