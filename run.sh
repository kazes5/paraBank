#!/usr/bin/env bash
# Single entry point for every test run. Results go to results/runs/<runId>/ (see README.md).
#
#   ./run.sh setup                                   register / verify the .env test users
#   ./run.sh explore                                 Stage 1 exploration on a throwaway customer
#   ./run.sh smoke|suites|journey|all [--user PARABANK2] [--keep]
#   ./run.sh manual [AUTH-03 AUTH-05 TRF-08 TRF-09] [--headless] [--keep]
#   ./run.sh ui [apiRunId|latest] [--user PARABANK2] [--keep]
#   ./run.sh repro [--publish] [--keep]
#   ./run.sh load [--dry] [--keep]                   k6 load session L1-L6 (deliverables/load_test_plan.md)
#   ./run.sh isolate [--keep]                        concurrency isolation of a load reconciliation failure
#   ./run.sh auto [--user PARABANK2] [--keep]        coded tests: pytest + requests (tests/automation)
#   ./run.sh report [--kept] [--publish] [--since T] Test Summary Report (2 pages) + detailed annex
#   ./run.sh docs [--check] [--since T]              refresh run facts in the documents from the kept runs
#   ./run.sh cycle [--keep] [--user PARABANK2]       setup → all → ui → manual → auto → load (→ isolate) → repro → report
#   ./run.sh web [--port 4321]                       web page: choose steps, live progress, verdict and links
#   ./run.sh package                                 submission zip in dist/ (committed content)
#   ./run.sh keep <runId|last>                       move a run to results/kept/ (committed)
#   ./run.sh list                                    show results/index.md
#   ./run.sh latest [api|ui|manual|repro|load|auto]  path of the latest summary.md

# Stop on errors, unset variables and failed pipes; always work from the repo root.
set -euo pipefail
cd "$(dirname "$0")"

# ---------------------------------------------------------------- arguments

# Print the usage block above (lines 2-21) without the leading "# ".
usage() {
  sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

# The first argument is the command; everything after it is options.
[[ $# -ge 1 ]] || usage
cmd=$1
shift

# Options shared by all commands. Unknown arguments are collected in "rest" and
# passed through to the script (e.g. case IDs for "manual", pytest args for "auto").
user=PARABANK
keep=0
rest=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --user) user=$2; shift 2 ;;             # which .env user prefix to run as
    --keep) keep=1; shift ;;                # keep the run (move it to results/kept/)
    --headless) export HEADLESS=1; shift ;; # browser tests without a visible window
    *) rest+=("$1"); shift ;;
  esac
done

# ---------------------------------------------------------------- prerequisite checks

# Credentials live in .env (git-ignored); every test command needs it.
need_env() {
  [[ -f .env ]] || { echo "No .env found: copy .env.example to .env and fill in the test users." >&2; exit 2; }
}

# The Postman CLI runs the collection (API tests, and the smoke gate before load tests).
need_postman() {
  command -v postman >/dev/null ||
    { echo "Postman CLI not found: https://learning.postman.com/docs/postman-cli/postman-cli-installation/" >&2; exit 2; }
}

# k6 runs the load tests.
need_k6() {
  command -v k6 >/dev/null || { echo "k6 not found: brew install k6" >&2; exit 2; }
}

# Playwright drives the locally installed Google Chrome (channel "chrome"); only a warning.
need_chrome() {
  [[ -d "/Applications/Google Chrome.app" ]] || command -v google-chrome >/dev/null ||
    echo "Note: Google Chrome not found; Playwright uses channel 'chrome'." >&2
}

# Run a Node script with the .env variables loaded.
node_env() {
  node --env-file=.env "$@"
}

# ---------------------------------------------------------------- commands

# status = exit code of the command's script (0 pass, 1 failures found, 2 usage, 3 blocked)
status=0
case $cmd in

  # Register or verify the .env test users (needed after every site reset).
  setup)
    need_env
    node_env tests/scripts/setup-users.mjs || status=$?
    ;;

  # Stage 1 exploration: journey walk + edge probes on a throwaway customer, written to
  # evidence/exploration/ (frozen evidence the business rules cite).
  explore)
    need_env
    node_env tests/scripts/explore.mjs || status=$?
    ;;

  # API tests with the Postman CLI. The collection is regenerated from the builder first,
  # so the JSON always matches build-collection.mjs. "all" runs the three phases in order.
  smoke|suites|journey|all)
    need_env
    need_postman
    node tests/scripts/build-collection.mjs >/dev/null
    phases=$([[ $cmd == all ]] && echo "smoke suites journey" || echo "$cmd")
    # shellcheck disable=SC2086  # phases is intentionally split into words
    node_env tests/scripts/run-api.mjs "$user" $phases || status=$?
    ;;

  # Manual cases in a visible Chrome window, with captioned screenshots.
  manual)
    need_env
    need_chrome
    node_env tests/scripts/manual-tests.mjs ${rest[@]+"${rest[@]}"} || status=$?
    ;;

  # Web UI cross-check of an API run (default: the latest).
  ui)
    need_env
    need_chrome
    node_env tests/scripts/ui-crosscheck.mjs "${rest[0]:-latest}" "$user" || status=$?
    ;;

  # Reproduce every known defect on fresh throwaway users.
  repro)
    need_env
    node_env tests/scripts/repro-defects.mjs ${rest[@]+"${rest[@]}"} || status=$?
    ;;

  # k6 load session L1-L6 (needs the Postman CLI for its smoke gate).
  load)
    need_env
    need_k6
    need_postman
    node_env tests/load/run-load.mjs ${rest[@]+"${rest[@]}"} || status=$?
    ;;

  # Isolation of a load reconciliation failure: 5 sequential, then 3 rounds of 5 simultaneous transfers.
  isolate)
    need_env
    node_env tests/load/isolate-concurrency.mjs || status=$?
    ;;

  # Coded tests with pytest. The virtual environment is created on first use and
  # reinstalled whenever requirements.txt is newer than the last install.
  auto)
    need_env
    venv=tests/automation/.venv
    if [[ ! -x $venv/bin/python || tests/automation/requirements.txt -nt $venv/.installed ]]; then
      { [[ -x $venv/bin/python ]] || python3 -m venv "$venv"; } &&
        "$venv/bin/pip" install -q -r tests/automation/requirements.txt &&
        touch "$venv/.installed"
    fi
    (cd tests/automation && AUTO_USER=$user .venv/bin/python -m pytest ${rest[@]+"${rest[@]}"}) || status=$?
    node tests/scripts/results.mjs index >/dev/null # add the run to results/index.md
    ;;

  # Test Summary Report (Markdown + PDF) from the latest runs. --publish also refreshes the documents.
  # .env is loaded when present, so the refreshed text is redacted with the real secrets.
  report)
    need_chrome
    if [[ -f .env ]]; then node_env tests/scripts/build-str.mjs ${rest[@]+"${rest[@]}"} || status=$?
    else node tests/scripts/build-str.mjs ${rest[@]+"${rest[@]}"} || status=$?; fi
    ;;

  # Refresh every run-specific fact in the documents (marked <!-- auto:… --> blocks) and the BUG-016
  # evidence from the latest kept runs; --check only reports what is out of date.
  docs)
    if [[ -f .env ]]; then node_env tests/scripts/update-docs.mjs ${rest[@]+"${rest[@]}"} || status=$?
    else node tests/scripts/update-docs.mjs ${rest[@]+"${rest[@]}"} || status=$?; fi
    ;;

  # One full test cycle. It starts by registering / verifying the test users (the public site resets
  # now and then and wipes them) and stops as BLOCKED (exit 3) if that fails or the API smoke gate fails.
  # Otherwise every step runs even if an earlier one found failures: failures are findings. The steps
  # do not keep their runs: cycle-finish.mjs first checks that every layer has a complete run of this
  # cycle (a site reset mid-cycle leaves BLOCKED cases or crashed steps); an incomplete cycle keeps and
  # publishes nothing (exit 3). A complete one with --keep keeps its runs, publishes the defect bundles,
  # then the STR (from this cycle's runs only, --since) and the refreshed documents.
  cycle)
    need_env
    need_postman
    need_k6
    start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    failed=()
    step() { local name=$1; shift; "$@" || failed+=("$name (exit $?)"); }
    ./run.sh setup || { echo "Cycle BLOCKED: test users could not be registered or verified." >&2; exit 3; }
    # Steps run without --keep: the runs are kept only once the whole cycle is known to be complete.
    api_status=0
    ./run.sh all --user "$user" || api_status=$?
    if [[ $api_status == 3 ]]; then
      echo "Cycle BLOCKED: the API smoke gate failed, so nothing else ran and nothing was kept or published." >&2
      exit 3
    fi
    [[ $api_status == 0 ]] || failed+=("api (exit $api_status)")
    step ui ./run.sh ui latest --user "$user"
    step manual ./run.sh manual --headless
    step auto ./run.sh auto --user "$user"
    step load ./run.sh load
    # A failed reconciliation is isolated right away (plan §2.5), so the report can link the evidence.
    # Only a load run of this cycle counts (a blocked load step leaves the previous run as "latest").
    if node -e 'const [f, t] = process.argv.slice(1); const r = require(require("path").resolve(f));
        process.exit(r.reconciliation === "FAIL" && Date.parse(r.started) >= Date.parse(t) ? 0 : 1)' \
        "$(dirname "$(node tests/scripts/results.mjs latest load)")/run.json" "$start" 2>/dev/null; then
      step isolate ./run.sh isolate
    fi
    # Every known defect reproduced on fresh throwaway users (the bug evidence the report links).
    step repro ./run.sh repro
    # Complete cycle? Only then: keep its runs, publish the defect bundles, the STR and the documents.
    k=()
    [[ $keep == 1 ]] && k=(--keep)
    if ! node_env tests/scripts/cycle-finish.mjs --since "$start" ${k[@]+"${k[@]}"}; then
      echo "Cycle started $start. Steps that found failures or errors: ${failed[*]:-none}"
      exit 3
    fi
    if [[ $keep == 1 ]]; then
      step report ./run.sh report --kept --publish --since "$start"
    else
      step report ./run.sh report --since "$start"
    fi
    echo "Cycle started $start. Steps that found failures or errors: ${failed[*]:-none}"
    [[ ${#failed[@]} -eq 0 ]]
    exit
    ;;

  # Local web page to choose and run steps, with live progress, the verdict and links (127.0.0.1 only).
  web)
    node tests/web/server.mjs ${rest[@]+"${rest[@]}"}
    exit
    ;;

  # Submission zip of the committed repository (git archive: no .env, no local runs, no venv).
  # Refuses to package while there are uncommitted changes, so the zip always equals a commit.
  package)
    if [[ -n $(git status --porcelain) ]]; then
      echo "Uncommitted changes: commit first, so the zip matches the repository." >&2
      exit 2
    fi
    mkdir -p dist
    zip="dist/ParaBank_QA_submission_$(date -u +%Y-%m-%d)_$(git rev-parse --short HEAD).zip"
    git archive --format=zip --prefix=ParaBank_QA/ -o "$zip" HEAD
    echo "Submission: $zip ($(du -h "$zip" | cut -f1))"
    exit
    ;;

  # Results housekeeping (no test traffic).
  keep)
    node tests/scripts/results.mjs keep "${rest[0]:-last}"
    exit
    ;;
  list)
    node tests/scripts/results.mjs list
    exit
    ;;
  latest)
    node tests/scripts/results.mjs latest ${rest[0]+"${rest[0]}"}
    exit
    ;;

  *)
    usage
    ;;
esac

# ---------------------------------------------------------------- keep

# --keep moves the run this command just created to results/kept/.
# Exit 3 = BLOCKED before this command created a run folder, so there is nothing to keep
# ("last" would otherwise point at an older run, e.g. the smoke gate's).
if [[ $keep == 1 && $cmd != setup && $cmd != explore && $cmd != report && $cmd != docs && $status != 3 ]]; then
  node tests/scripts/results.mjs keep last
fi
exit $status
