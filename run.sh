#!/usr/bin/env bash
# Single entry point for every test run. Results go to results/runs/<runId>/ (see README.md).
#
#   ./run.sh setup                                   register / verify the .env test users
#   ./run.sh smoke|suites|journey|all [--user PARABANK2] [--keep]
#   ./run.sh manual [AUTH-03 AUTH-05 TRF-08 TRF-09] [--headless] [--keep]
#   ./run.sh ui [apiRunId|latest] [--user PARABANK2] [--keep]
#   ./run.sh repro [--publish] [--keep]
#   ./run.sh load [--dry] [--keep]                   k6 load session L1-L6 (tests/load/load_test_plan.md)
#   ./run.sh auto [--user PARABANK2] [--keep]        coded tests: pytest + requests (tests/automation)
#   ./run.sh report [--kept] [--publish]             Test Summary Report (STR.md + STR.pdf) from the latest runs
#   ./run.sh cycle [--keep] [--user PARABANK2]       all → ui → manual (headless) → auto → load → report
#   ./run.sh keep <runId|last>                       move a run to results/kept/ (committed)
#   ./run.sh list                                    show results/index.md
#   ./run.sh latest [api|ui|manual|repro|load|auto]  path of the latest summary.md

# Stop on errors, unset variables and failed pipes; always work from the repo root.
set -euo pipefail
cd "$(dirname "$0")"

# ---------------------------------------------------------------- arguments

# Print the usage block above (lines 2-16) without the leading "# ".
usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
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

  # Test Summary Report (Markdown + PDF) from the latest runs.
  report)
    need_chrome
    node tests/scripts/build-str.mjs ${rest[@]+"${rest[@]}"} || status=$?
    ;;

  # One full test cycle. Every step runs even if an earlier one found failures
  # ("|| true"), and the report is built from whatever the cycle produced.
  # With --keep every run is kept and the root STR.md / STR.pdf are republished.
  cycle)
    need_env
    need_postman
    need_k6
    k=()
    [[ $keep == 1 ]] && k=(--keep)
    ./run.sh all --user "$user" ${k[@]+"${k[@]}"} || true
    ./run.sh ui latest --user "$user" ${k[@]+"${k[@]}"} || true
    ./run.sh manual --headless ${k[@]+"${k[@]}"} || true
    ./run.sh auto --user "$user" ${k[@]+"${k[@]}"} || true
    ./run.sh load ${k[@]+"${k[@]}"} || true
    if [[ $keep == 1 ]]; then ./run.sh report --kept --publish; else ./run.sh report; fi
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
if [[ $keep == 1 && $cmd != setup && $cmd != report && $status != 3 ]]; then
  node tests/scripts/results.mjs keep last
fi
exit $status
