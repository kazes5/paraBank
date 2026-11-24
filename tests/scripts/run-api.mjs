// API test runner (plan.md Stage 3): smoke gate -> endpoint suites -> customer journey.
//
// - Credentials and profile come from .env and are passed with --env-var; nothing secret is
//   written to the collection or environment files.
// - Output: results/runs/<runId>-api/ — logs/ (redacted CLI output), reports/ (Postman YAML),
//   run.json, then summary.md + results.json from summarize.mjs. Index and history are rebuilt.
// - Smoke failing stops the run: suites and journey are BLOCKED.
//
// Usage: ./run.sh smoke|suites|journey|all [--user PARABANK2]
//        node --env-file=.env tests/scripts/run-api.mjs [PREFIX] [phase ...]

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API, readUser, redact, redactTree, newRun } from './lib/common.mjs';
import { summarize } from './summarize.mjs';

const args = process.argv.slice(2);
const prefix = args[0] && /^[A-Z0-9_]+$/.test(args[0]) ? args.shift() : 'PARABANK';
const phases = args.length ? args : ['smoke', 'suites', 'journey'];
const u = readUser(prefix);
const vars = {
  baseUrl: API, username: u.username, password: u.password, ssn: u.ssn,
  firstName: u.firstName, lastName: u.lastName, street: u.street, city: u.city,
  state: u.state, zipCode: u.zipCode, phoneNumber: u.phoneNumber, fallbackAccountId: u.fallbackAccountId,
};
const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`Missing ${prefix}_* values in .env: ${missing.join(', ')}`); process.exit(2); }

const PHASE_ITEMS = {
  smoke: ['00 Smoke'],
  suites: ['10 Suite fixtures', '11 LOG Login', '12 CUS Customer', '13 ACC Accounts', '14 TRF Transfer', '15 DEP Deposit',
    '16 WDR Withdraw', '17 BIL Bill pay', '18 LON Loan', '19 TRX Transactions'],
  journey: ['01 Customer Journey'],
};
for (const p of phases) if (!PHASE_ITEMS[p]) { console.error(`Unknown phase ${p} (smoke, suites, journey)`); process.exit(2); }

const run = newRun('api', { user: u.username, phases, scope: phases.length === 3 ? 'all' : phases.join(', ') });
const logs = run.sub('logs');
const summary = [];
for (const phase of phases) {
  const reportDir = join(run.dir, 'reports', phase);
  const cliArgs = ['collection', 'run', 'tests/postman/ParaBank_QA.postman_collection.json',
    '-e', 'tests/postman/ParaBank_QA.postman_environment.json',
    ...PHASE_ITEMS[phase].flatMap((i) => ['-i', i]),
    ...Object.entries(vars).flatMap(([k, v]) => ['--env-var', `${k}=${v}`]),
    '--env-var', `runId=${run.id}`,
    '--delay-request', '1500', '--timeout-request', '5000',
    '--no-report-events', '--output', reportDir];
  const started = Date.now();
  const r = spawnSync('postman', cliArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  writeFileSync(join(logs, `${phase}.log`), redact(`${r.stdout || ''}${r.stderr || ''}`));
  redactTree(reportDir);
  const seconds = Math.round((Date.now() - started) / 1000);
  summary.push({ phase, exitCode: r.status, seconds });
  console.log(`${phase}: exit ${r.status} in ${seconds}s`);
  if (phase === 'smoke' && r.status !== 0) { console.log('Smoke failed: stopping. Suites and journey are BLOCKED.'); break; }
}
run.update({ finished: new Date().toISOString(), phaseResults: summary });
summarize(run.dir);
console.log(`Run: ${run.dir}`);
process.exit(summary.every((p) => p.exitCode === 0) ? 0 : 1);
