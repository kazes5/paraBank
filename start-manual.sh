#!/usr/bin/env bash
# Manual test cases AUTH-03, AUTH-05, TRF-08, TRF-09 in a visible Chrome window with captioned screenshots.
# TRF-09 runs on a throwaway user that the script registers (it breaks the accounts it touches).
# Usage: ./start-manual.sh [AUTH-03 AUTH-05 TRF-08 TRF-09]   (default: all four)
#        HEADLESS=1 ./start-manual.sh   to run without a window
# Output: evidence/manual/<runId>/ with manual-results.md and screenshots
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] || { echo "No .env found: create it with the test user details (see plan.md Stage 0)." >&2; exit 2; }
[[ -d "/Applications/Google Chrome.app" ]] || echo "Note: Google Chrome not found; Playwright needs it (channel chrome)." >&2
exec node --env-file=.env scripts/manual-tests.mjs "$@"
