# Submission — ParaBank API QA exercise

**Start here.** Every deliverable of the exercise, where it is, and how to re-run it.
Repository: <https://github.com/kazes5/paraBank> (the same content is in the zip, if you received one).

## Verdict

**NO-GO.** The API is not ready to handle real money: 16 open defects, 4 of them Critical (money created by concurrent transfers, no authentication, negative amounts accepted, one sub-cent transfer breaks a customer's accounts). Two-page report: [`STR.pdf`](STR.pdf) ([`STR.md`](STR.md)).

## Deliverables

| Exercise deliverable | Where | Key facts |
|---|---|---|
| 1. Test Design Document (STD) | [`STD.md`](STD.md) | 47 prioritized cases (positive, negative, boundary, security, data integrity); scope, assumptions, risks, approach; what to automate and why (§5.8); open questions (§6). Business rules derived from Swagger, UI and behavior: [`Business_Rules.md`](Business_Rules.md) |
| 2. Postman collection and environment | [`tests/postman/ParaBank_QA.postman_collection.json`](tests/postman/ParaBank_QA.postman_collection.json), [`tests/postman/ParaBank_QA.postman_environment.json`](tests/postman/ParaBank_QA.postman_environment.json) | Collection v2.1, 152 requests covering every API case: environment variables, login handled, assertions on status, schema and business values. Secrets are blank in the environment |
| 3. Bug reports and spec questions | [`Bug_Reports.md`](Bug_Reports.md), evidence in [`evidence/bugs/`](evidence/bugs) | 16 defects in Jira style (title, steps, expected vs. actual, severity, priority, request and response). 15 spec questions. Every defect reproduced on a fresh user, next to a passing control input |
| 4. Load and performance test | [`tests/load/load_test_plan.md`](tests/load/load_test_plan.md), k6 scripts in [`tests/load/`](tests/load), results in `results/kept/*-load` | SLAs, baseline and higher load for both endpoints, at most 10 virtual users. Load model and the limits of a shared site are explained in the plan. Speed: all SLAs met. Correctness: concurrent transfers create money (BUG-016) |
| 5. Test Summary Report (STR) | [`STR.pdf`](STR.pdf) / [`STR.md`](STR.md) (2 pages), annex [`STR_Detailed.pdf`](STR_Detailed.pdf) / [`STR_Detailed.md`](STR_Detailed.md) | What was and was not tested, pass/fail numbers, defects by severity, risks, go / no-go with justification. The annex has charts, per-case results, reproduction commands and screenshots |
| 6. Bonus: automation | [`tests/automation/`](tests/automation) ([README](tests/automation/README.md)) | pytest + requests: customer journey J02–J17, TRF-01, TRF-03, DEP-01, ACCT-03. Known defects are strict expected failures, so a fix turns the run red as a retest signal |

Supporting material: [`plan.md`](plan.md) (test plan and execution status per stage), [`parabank_test_approach.md`](parabank_test_approach.md) (approach), [`results/index.md`](results/index.md) (every run), [`docs/walkthrough.md`](docs/walkthrough.md) (demo script), [`docs/exercise/`](docs/exercise) (the exercise files as provided).

## Re-run it

Requirements and setup: [`README.md`](README.md#quick-start). In short: copy `.env.example` to `.env` and fill in a test user you registered yourself, then:

```bash
./run.sh setup     # register or verify the test user (also needed after a site reset)
./run.sh cycle     # everything: API tests, UI cross-check, manual cases, coded tests, load test, report (~45 min)
./run.sh web       # or use the local web page: choose steps, watch progress, get the verdict and links
```

Single layers: `./run.sh all` (Postman, ~5 min), `./run.sh auto` (pytest, ~2 min), `./run.sh load` (k6, ~18 min), `./run.sh report` (STR).

## Ground rules kept

- **Environment:** only the public site `parabank.parasoft.com`; the Docker image or WAR file was not needed.
- **Admin endpoints never called:** `/cleanDB`, `/initializeDB`, `/setParameter` and the JMS endpoints. Every runner refuses them (guards in the Postman collection, the Node scripts and pytest).
- **Small load:** at most 10 virtual users, runs of 1–3 minutes, paced requests, automatic stop on any HTTP 429.
- **Own data only:** our own registered users, plus throwaway users created by the scripts for destructive cases. No other customer's data was touched.
- **No credentials in the repository:** passwords and SSNs are redacted in every log, report and evidence file. The test users' profile details are replaced by placeholders such as `<USERNAME>`. `.env` was never committed.

## Suggested review path (15 minutes)

1. [`STR.pdf`](STR.pdf): the verdict and why (2 pages).
2. [`Bug_Reports.md`](Bug_Reports.md): the 4 Critical defects first (BUG-016, BUG-002, BUG-003, BUG-001).
3. [`docs/walkthrough.md`](docs/walkthrough.md): one failure followed from the journey to its suite to the bug report.
4. [`STD.md`](STD.md) §4–5: the approach and the cases.
5. Optionally run `./run.sh web` and start a "Quick check".
