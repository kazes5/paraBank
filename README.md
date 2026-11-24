# ParaBank API — QA exercise

Test design, automated tests and defect reports for the ParaBank REST API (`https://parabank.parasoft.com/parabank/services/bank`).

## Where to find what

| I want… | Go to |
|---|---|
| The staged plan and how the work was done | [`plan.md`](plan.md) |
| The test design: rules, risks, 47 test cases, SLA model | [`STD.md`](STD.md) |
| What the API does and doesn't do: contract, observed behavior, business rules | [`Business_Rules.md`](Business_Rules.md) |
| The defects (15 bug reports) and the questions for R&D | [`Bug_Reports.md`](Bug_Reports.md) |
| The latest results, and every run | [`results/index.md`](results/index.md) |
| How each case's verdict changed across runs | [`results/history.md`](results/history.md) |
| The evidence cited by the documents | [`evidence/`](evidence/): `exploration/` (Stage 1) and `bugs/BUG-0NN/` (Stage 4) |
| The original exercise and templates | [`docs/exercise/`](docs/exercise/) |
| The Postman collection and environment | [`tests/postman/`](tests/postman/) |

## Quick start

Requirements: Node 20+, the [Postman CLI](https://learning.postman.com/docs/postman-cli/postman-cli-installation/), Google Chrome (only for the browser tests), and `npm install` (Playwright).

```bash
cp .env.example .env        # fill in the test users (never committed)
./run.sh setup              # register or verify the test users on the public site
./run.sh all                # smoke gate → endpoint suites → customer journey (~4.5 min)
./run.sh latest             # path of the summary of the run you just did
```

| Command | What it runs | Time |
|---|---|---|
| `./run.sh smoke` | Smoke gate (6 cases) | ~15 s |
| `./run.sh suites` | Endpoint suites 11–19, each with fresh accounts | ~3 min |
| `./run.sh journey` | Customer journey JRN-01 (J02–J17) | ~80 s |
| `./run.sh all` | All three; stops if smoke fails | ~4.5 min |
| `./run.sh ui [apiRunId]` | Web UI cross-check of an API run (default: the latest) | ~1 min |
| `./run.sh manual [AUTH-03 …]` | Manual cases in a visible Chrome window, with captioned screenshots (`--headless` to hide it) | ~2 min |
| `./run.sh repro [--publish]` | Reproduce every known defect on fresh throwaway users | ~5 min |

**Options:**
- `--user PARABANK2`: run as the second `.env` user.
- `--keep`: keep the run (see below).

The npm aliases (`npm run test:all`, …) call the same commands.

## Results

Each run creates one folder, `results/runs/<UTC time>-<kind>/`:

```
summary.md      verdict per case (or per check) — start here
results.json    the same, machine-readable
run.json        what ran: user, phases, git commit, timings, account IDs
logs/           redacted Postman CLI output, including one FAILED record per failing request
reports/        Postman run reports (YAML)
screenshots/    browser runs only
```

**Which runs are committed:**
- Runs stay **local** (git-ignored) unless you keep them: `./run.sh keep <runId>` (or `--keep`) moves the run to `results/kept/`, which is committed.
- [`results/index.md`](results/index.md) and [`results/history.md`](results/history.md) are rebuilt after every run and always committed.
- `evidence/` is frozen: runs never write there. `./run.sh repro --publish` deliberately refreshes the bug bundles.

**Safety:**
- Passwords and SSNs are redacted in every file, in every encoding.
- Destructive tests (the sub-cent transfer) run only on throwaway users that the scripts register.
- Requests are paced 1.5 s apart (the public site rate-limits).
- The admin endpoints are never called.

## Repository layout

```
README.md  run.sh                      start here · single entry point
plan.md  STD.md  Business_Rules.md  Bug_Reports.md  parabank_test_approach.md
docs/exercise/                         provided exercise files and templates (00–06, OpenAPI)
tests/postman/                         ParaBank_QA collection + environment (legacy/ = original login-only files)
tests/scripts/                         build-collection, run-api, summarize, ui-crosscheck, manual-tests,
                                       repro-defects, setup-users, explore, results, check-links, lib/
results/                               index.md, history.md, kept/ (committed), runs/ (local)
evidence/                              exploration/ (Stage 1), bugs/BUG-0NN/ (Stage 4)
```

**If you edit tests,** change `tests/scripts/build-collection.mjs`, not the collection JSON. `run.sh` regenerates the collection before every API run.

**Checks:**
- `node tests/scripts/check-links.mjs` verifies that every path the documents mention exists.

## Stage map

| Stage (plan.md) | Output |
|---|---|
| 0 Setup | `tests/scripts/setup-users.mjs`, `.env` |
| 1 Exploration | `Business_Rules.md`, `evidence/exploration/` |
| 2 Test design | `STD.md` |
| 3 Postman build and execution | `tests/postman/`, `results/kept/*-api`, `*-ui`, `*-manual` |
| 4 Failure isolation and bug reports | `Bug_Reports.md`, `evidence/bugs/` |
| 5 Load test | *next* |
| 6 Test summary report | *later* |
