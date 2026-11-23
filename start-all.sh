#!/usr/bin/env bash
# Full run: smoke gate -> endpoint suites -> customer journey (stops if smoke fails)
# Usage: ./start-all.sh [PARABANK|PARABANK2]   (default PARABANK = first user in .env)
# Output: evidence/stage3/<runId>/ with redacted logs and results.md
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] || { echo "No .env found: create it with the test user details (see plan.md Stage 0)." >&2; exit 2; }
command -v postman >/dev/null || { echo "Postman CLI not found: install it first (https://learning.postman.com/docs/postman-cli/postman-cli-installation/)." >&2; exit 2; }
node scripts/build-collection.mjs >/dev/null
exec node --env-file=.env scripts/run-stage3.mjs "${1:-PARABANK}" 
