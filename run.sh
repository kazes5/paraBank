#!/usr/bin/env bash
# Single entry point for every test run. Results go to results/runs/<runId>/ (see README.md).
#
#   ./run.sh setup                                   register / verify the .env test users
#   ./run.sh smoke|suites|journey|all [--user PARABANK2] [--keep]
#   ./run.sh manual [AUTH-03 AUTH-05 TRF-08 TRF-09] [--headless] [--keep]
#   ./run.sh ui [apiRunId|latest] [--user PARABANK2] [--keep]
#   ./run.sh repro [--publish] [--keep]
#   ./run.sh load [--dry] [--keep]                   k6 load session L1-L6 (tests/load/load_test_plan.md)
#   ./run.sh keep <runId|last>                       move a run to results/kept/ (committed)
#   ./run.sh list                                    show results/index.md
#   ./run.sh latest [api|ui|manual|repro|load]            path of the latest summary.md
set -euo pipefail
cd "$(dirname "$0")"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[[ $# -ge 1 ]] || usage
cmd=$1; shift

# options shared by all commands
user=PARABANK keep=0 rest=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --user) user=$2; shift 2 ;;
    --keep) keep=1; shift ;;
    --headless) export HEADLESS=1; shift ;;
    *) rest+=("$1"); shift ;;
  esac
done

need_env()    { [[ -f .env ]] || { echo "No .env found: copy .env.example to .env and fill in the test users." >&2; exit 2; }; }
need_postman(){ command -v postman >/dev/null || { echo "Postman CLI not found: https://learning.postman.com/docs/postman-cli/postman-cli-installation/" >&2; exit 2; }; }
need_k6()     { command -v k6 >/dev/null || { echo "k6 not found: brew install k6" >&2; exit 2; }; }
need_chrome() { [[ -d "/Applications/Google Chrome.app" ]] || command -v google-chrome >/dev/null || echo "Note: Google Chrome not found; Playwright uses channel 'chrome'." >&2; }
node_env()    { node --env-file=.env "$@"; }

status=0
case $cmd in
  setup)   need_env; node_env tests/scripts/setup-users.mjs || status=$? ;;
  smoke|suites|journey|all)
           need_env; need_postman
           node tests/scripts/build-collection.mjs >/dev/null
           phases=$([[ $cmd == all ]] && echo "smoke suites journey" || echo "$cmd")
           # shellcheck disable=SC2086
           node_env tests/scripts/run-api.mjs "$user" $phases || status=$? ;;
  manual)  need_env; need_chrome; node_env tests/scripts/manual-tests.mjs ${rest[@]+"${rest[@]}"} || status=$? ;;
  ui)      need_env; need_chrome; node_env tests/scripts/ui-crosscheck.mjs "${rest[0]:-latest}" "$user" || status=$? ;;
  repro)   need_env; node_env tests/scripts/repro-defects.mjs ${rest[@]+"${rest[@]}"} || status=$? ;;
  load)    need_env; need_k6; need_postman; node_env tests/load/run-load.mjs ${rest[@]+"${rest[@]}"} || status=$? ;;
  keep)    node tests/scripts/results.mjs keep "${rest[0]:-last}"; exit ;;
  list)    node tests/scripts/results.mjs list; exit ;;
  latest)  node tests/scripts/results.mjs latest ${rest[0]+"${rest[0]}"}; exit ;;
  *)       usage ;;
esac

# exit 3 = BLOCKED before a run folder of this command existed: nothing to keep
if [[ $keep == 1 && $cmd != setup && $status != 3 ]]; then node tests/scripts/results.mjs keep last; fi
exit $status
