#!/usr/bin/env bash
# Runs the login collection with the Postman CLI, injecting credentials from ../.env
# Usage: ./postman/run-login-postman-cli.sh [extra postman collection run options]
set -euo pipefail
cd "$(dirname "$0")"
# Export every .env variable to the commands below (credentials never appear on the command line in scripts).
set -a; source ../.env; set +a
postman collection run ParaBank_Login.postman_collection.json \
  -e ParaBank.postman_environment.json \
  --env-var "baseUrl=${BASE_URL}" \
  --env-var "username=${PARABANK_USERNAME}" \
  --env-var "password=${PARABANK_PASSWORD}" \
  --env-var "customerId=${CUSTOMER_ID:-}" \
  "$@"
