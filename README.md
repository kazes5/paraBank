# ParaBank API — QA exercise

Test design, automated tests and defect reports for the ParaBank REST API (`https://parabank.parasoft.com/parabank/services/bank`).

## Where to find what

| I want… | Go to |
|---|---|
| **The submission: every deliverable, how to re-run, review path** | [`SUBMISSION.md`](SUBMISSION.md) |
| **The Test Summary Report (2 pages): go / no-go** | [`STR.pdf`](STR.pdf) · [`STR.md`](STR.md) |
| The detailed STR annex: per-case results, charts, reproduction, screenshots | [`STR_Detailed.pdf`](STR_Detailed.pdf) · [`STR_Detailed.md`](STR_Detailed.md) |
| A demo script: one failure from the journey to the bug report | [`docs/walkthrough.md`](docs/walkthrough.md) |
| The staged plan and how the work was done | [`plan.md`](plan.md) |
| The test design: rules, risks, 47 test cases, SLA model | [`STD.md`](STD.md) |
| What the API does and doesn't do: contract, observed behavior, business rules | [`Business_Rules.md`](Business_Rules.md) |
| The defects (16 bug reports) and the questions for R&D | [`Bug_Reports.md`](Bug_Reports.md) |
| The latest results, and every run | [`results/index.md`](results/index.md) |
| How each case's verdict changed across runs | [`results/history.md`](results/history.md) |
| The evidence cited by the documents | [`evidence/`](evidence/): `exploration/` (Stage 1) and `bugs/BUG-0NN/` (Stage 4) |
| The original exercise and templates | [`docs/exercise/`](docs/exercise/) |
| The Postman collection and environment | [`tests/postman/`](tests/postman/) |

## Quick start

Requirements: Node 20+, Python 3.9+ (coded tests only), [k6](https://k6.io) (load tests only), the [Postman CLI](https://learning.postman.com/docs/postman-cli/postman-cli-installation/), Google Chrome (only for the browser tests), and `npm install` (Playwright).

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
| `./run.sh web` | Test runner web page at http://127.0.0.1:4321 (see [below](#test-runner-web-page)) | — |
| `./run.sh auto` | Coded tests, pytest + requests: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03 ([`tests/automation/README.md`](tests/automation/README.md)) | ~2 min |
| `./run.sh cycle [--keep]` | One full test cycle: all → ui → manual (headless) → auto → load → report | ~45 min |
| `./run.sh report [--kept] [--publish]` | Test Summary Report (2 pages) and its detailed annex, Markdown + PDF, from the latest runs; `--publish` updates `STR*.md` / `STR*.pdf` in the root | ~20 s |
| `./run.sh load [--dry]` | k6 load session L1–L6 ([`tests/load/load_test_plan.md`](tests/load/load_test_plan.md)) | ~18 min |
| `./run.sh package` | Submission zip of the committed repository in `dist/` (refuses while changes are uncommitted) | ~2 s |

**Options:**
- `--user PARABANK2`: run as the second `.env` user.
- `--keep`: keep the run (see below).

The npm aliases (`npm run test:all`, …) call the same commands.

## Test runner web page

A local page for running the tests without the command line: choose what to run, watch the progress live, and get the verdict with links to every report, bug, piece of evidence and deliverable.

**Start it:**

```bash
./run.sh web                 # or: npm run web
# open http://127.0.0.1:4321      (another port: ./run.sh web --port 5000)
```

Stop the page with Ctrl+C in the terminal. It needs the same `.env` and tools as the commands above.

**Run tests:**
1. Tick the steps to run, or pick a preset:

   | Preset | Steps | Time |
   |---|---|---|
   | Quick check | Set up users → API smoke → coded tests | ~4 min |
   | Full cycle | Set up users → API tests → UI cross-check → manual cases → coded tests → defect reproduction → load test → report | ~45 min |
   | Defects + report | Set up users → defect reproduction → report | ~8 min |
   | Report only | Report from the latest runs (no traffic to the site) | ~1 min |

   Steps always run in that order, whatever order you tick them in. "API tests" already includes smoke.
2. Choose the options:
   - **Run as:** the `.env` user (`PARABANK` or `PARABANK2`).
   - **Keep the runs:** move each run to `results/kept/`, ready to commit.
   - **Publish the deliverables:** also replace `STR*.md` / `STR*.pdf` and `evidence/bugs/` in the repo root. Turns on Keep, and builds the report from kept runs only.
   - **Show the browser for manual cases:** a visible Chrome window instead of headless.
3. Press **Run**. **Stop** ends the running step at once and skips the rest.

Keep "Set up test users" ticked: the public site resets now and then and wipes the users, which shows up as BLOCKED.

**While it runs:** an overall bar with time left; each step's status (pending, running, PASS, FAIL, BLOCKED, STOPPED, SKIPPED), the line it is printing now, and its result counts and report links as soon as it finishes; and a live log (passwords and SSNs hidden). You can close the tab: the job keeps running and the page catches up when you reopen it. One job runs at a time.

**The verdict:**

| Result | Meaning |
|---|---|
| PASS | Every selected step passed |
| FAIL | Failures were found. Today the known defects make the API tests, coded tests and defect reproduction fail by design; check the report for anything new |
| BLOCKED | A step could not run: smoke failed, login failed after a site reset, or the site rate-limited. Run "Set up test users" and try again |
| ERROR / STOPPED | A step stopped with an error, or you pressed Stop |

When the report step ran, the page also shows the STR's release recommendation (GO, GO WITH CONDITIONS or NO-GO) with a link to the PDF.

**Links:** this job's reports, the deliverables (STR, STD, bug reports, Postman collection, load plan and more), the bug reports and every defect evidence bundle, and the latest run of each kind. Files open in a read-only viewer: Markdown is rendered, folders are listed.

**Security:**
- The page listens on 127.0.0.1 only and refuses other host names and requests from other sites.
- It runs only the `./run.sh` commands listed above.
- It never serves `.env`, `.git` or other dotfiles.
- The code is in `tests/web/` (`server.mjs`, `index.html`).

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
- The test users' profile (username, name, address, phone) is replaced by placeholders such as `<USERNAME>` in every file, and masked in screenshots before they are taken.
- Destructive tests (the sub-cent transfer) run only on throwaway users that the scripts register.
- Requests are paced 1.5 s apart (the public site rate-limits).
- The admin endpoints are never called.

## Repository layout

```
README.md  run.sh                      start here · single entry point
SUBMISSION.md                          start page for reviewers
STR.md  STR.pdf                        Test Summary Report, 2 pages (generated)
STR_Detailed.md  STR_Detailed.pdf      detailed annex (generated)
plan.md  STD.md  Business_Rules.md  Bug_Reports.md  parabank_test_approach.md
docs/exercise/                         provided exercise files and templates (00–06, OpenAPI)
tests/load/                            load test plan + k6 scripts (Stage 5)
tests/automation/                      coded tests, pytest + requests (Stage 7)
tests/web/                             local test-runner web page (./run.sh web)
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
| 5 Load test | `tests/load/`, `results/kept/*-load` |
| 6 Test summary report | `STR.md`/`.pdf` (2 pages) and `STR_Detailed.md`/`.pdf` (generated by `tests/scripts/build-str.mjs` for every cycle) |
| 8 Packaging | `SUBMISSION.md`, `docs/walkthrough.md` |
| 7 Optional automation | `tests/automation/` (pytest), `results/kept/*-auto` |
| Tooling | `tests/web/`: test runner web page (`./run.sh web`) |
