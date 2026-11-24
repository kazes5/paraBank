// API test runner (plan.md Stage 3): smoke gate -> endpoint suites -> customer journey.
//
// - Credentials and profile come from .env. They are handed to the Postman CLI in a private
//   temporary environment file (folder 0700, file 0600, outside the repo, deleted after the run,
//   also on Ctrl+C or Stop), never on the command line, where any local process could read them
//   from the process list. Nothing secret is written to the committed collection or environment.
// - Output: results/runs/<runId>-api/ — logs/ (redacted CLI output), reports/ (Postman YAML),
//   run.json, then summary.md + results.json from summarize.mjs. Index and history are rebuilt.
// - Smoke failing stops the run: suites and journey are BLOCKED.
//
// Usage: ./run.sh smoke|suites|journey|all [--user PARABANK2]
//        node --env-file=.env tests/scripts/run-api.mjs [PREFIX] [phase ...]

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API, readUser, redact, redactTree, newRun, unwrapCli } from './lib/common.mjs';
import { summarize } from './summarize.mjs';

// Arguments: an optional .env user prefix (all caps), then the phases to run (default: all three).
const args = process.argv.slice(2);
const prefix = args[0] && /^[A-Z0-9_]+$/.test(args[0]) ? args.shift() : 'PARABANK';
const phases = args.length ? args : ['smoke', 'suites', 'journey'];
const u = readUser(prefix);
// Values passed to the collection as Postman environment variables (only in the private temp file below).
const vars = {
  baseUrl: API,
  username: u.username,
  password: u.password,
  ssn: u.ssn,
  firstName: u.firstName,
  lastName: u.lastName,
  street: u.street,
  city: u.city,
  state: u.state,
  zipCode: u.zipCode,
  phoneNumber: u.phoneNumber,
  fallbackAccountId: u.fallbackAccountId,
};
// Stop before any request if the .env user is incomplete (exit 2 = usage / setup problem).
const missing = Object.entries(vars)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing ${prefix}_* values in .env: ${missing.join(', ')}`);
  process.exit(2);
}

// Collection folders per phase (passed with -i, run in this order).
const PHASE_ITEMS = {
  smoke: ['00 Smoke'],
  suites: [
    '10 Suite fixtures',
    '11 LOG Login',
    '12 CUS Customer',
    '13 ACC Accounts',
    '14 TRF Transfer',
    '15 DEP Deposit',
    '16 WDR Withdraw',
    '17 BIL Bill pay',
    '18 LON Loan',
    '19 TRX Transactions',
  ],
  journey: ['01 Customer Journey'],
};
for (const p of phases)
  if (!PHASE_ITEMS[p]) {
    console.error(`Unknown phase ${p} (smoke, suites, journey)`);
    process.exit(2);
  }

// Create the run folder, then run each phase with the Postman CLI.
const run = newRun('api', { user: u.username, phases, scope: phases.length === 3 ? 'all' : phases.join(', ') });
const logs = run.sub('logs');
const summary = [];

// Private environment file: the committed environment (variable names and types) with this run's
// values filled in. The folder is created 0700 and the file 0600, so only this OS user can read it.
const tmpDir = mkdtempSync(join(tmpdir(), 'parabank-env-'));
const envFile = join(tmpDir, 'environment.json');
const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });
// Delete it on every exit path: normal end, Ctrl+C, and Stop from the web page (SIGTERM).
// With these handlers the signal waits until the running Postman CLI returns, then cleans up.
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
const base = JSON.parse(readFileSync('deliverables/postman/ParaBank_QA.postman_environment.json', 'utf8'));
const values = { ...vars, runId: run.id };
const known = new Set(base.values.map((v) => v.key));
base.values = [
  ...base.values.map((v) => (v.key in values ? { ...v, value: String(values[v.key]) } : v)),
  ...Object.entries(values)
    .filter(([k]) => !known.has(k))
    .map(([key, value]) => ({ key, value: String(value), type: 'default', enabled: true })),
];
writeFileSync(envFile, JSON.stringify(base), { mode: 0o600 });

for (const phase of phases) {
  const reportDir = join(run.dir, 'reports', phase);
  // Postman CLI arguments: collection + the private environment file (credentials, profile and run ID),
  // the phase's folders, 1.5 s between requests (site rate limit), 5 s timeout,
  // no upload to Postman's cloud, and a per-phase report folder. No secret appears on the command line.
  const cliArgs = [
    'collection',
    'run',
    'deliverables/postman/ParaBank_QA.postman_collection.json',
    '-e',
    envFile,
    ...PHASE_ITEMS[phase].flatMap((i) => ['-i', i]),
    '--delay-request',
    '1500',
    '--timeout-request',
    '5000',
    '--no-report-events',
    '--output',
    reportDir,
  ];
  const started = Date.now();
  const r = spawnSync('postman', cliArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  // Save the console output and the reports with every secret redacted.
  // Wrapped console lines are joined first, so no secret or profile value is split where redact() can't see it.
  writeFileSync(join(logs, `${phase}.log`), redact(unwrapCli(`${r.stdout || ''}${r.stderr || ''}`)));
  redactTree(reportDir);
  const seconds = Math.round((Date.now() - started) / 1000);
  summary.push({ phase, exitCode: r.status, seconds });
  console.log(`${phase}: exit ${r.status} in ${seconds}s`);
  // Smoke is the gate: if it fails, the rest of the API cannot be trusted, so stop here.
  if (phase === 'smoke' && r.status !== 0) {
    console.log('Smoke failed: stopping. Suites and journey are BLOCKED.');
    break;
  }
}
// Finish: record phase results, build summary.md / results.json. Exit 0 if every phase passed,
// 3 (BLOCKED) if the smoke gate failed (nothing else was tested: e.g. a site reset wiped the user;
// run.sh does not keep a blocked run), otherwise 1 (failures found).
run.update({ finished: new Date().toISOString(), phaseResults: summary });
summarize(run.dir);
console.log(`Run: ${run.dir}`);
const smokeBlocked = summary.some((p) => p.phase === 'smoke' && p.exitCode !== 0);
process.exit(summary.every((p) => p.exitCode === 0) ? 0 : smokeBlocked ? 3 : 1);
