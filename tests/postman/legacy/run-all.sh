#!/usr/bin/env bash
# 1) Logs in as the .env test user via the web UI; re-registers it only if login fails
# 2) Runs the full Postman collection with the Postman CLI
#
# Usage: ./run-all.sh [extra `postman collection run` options]
#        HEADED=1 ./run-all.sh   # watch the browser while it registers
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "No .env found. Copy .env.example to .env and fill it in." >&2
  exit 2
fi
set -a; source .env; set +a

echo "== Step 1: ensure test user exists (login, else register)"
node scripts/register-user.mjs

echo "== Step 2: run Postman collection"
postman collection run postman/ParaBank_Login.postman_collection.json \
  -e postman/ParaBank.postman_environment.json \
  --env-var "baseUrl=${BASE_URL}" \
  --env-var "username=${PARABANK_USERNAME}" \
  --env-var "password=${PARABANK_PASSWORD}" \
  "$@"
