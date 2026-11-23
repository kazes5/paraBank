// Stage 3 runner (plan.md §3.3): smoke gate -> endpoint suites -> customer journey.
//
// - Credentials and profile come from .env (user prefix PARABANK by default) and are passed with
//   --env-var; nothing secret is written to the collection or environment files.
// - All CLI output and the YAML run reports are redacted (password, SSN in every encoding)
//   before they are written to evidence/stage3/<runId>/.
// - Smoke failing stops the run: suites and journey are not executed (BLOCKED).
//
// Usage: node --env-file=.env scripts/run-stage3.mjs [PREFIX] [phase ...]   (or ./start-*.sh)
//        phases: smoke suites journey (default: all, in that order)

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const prefix = args[0] && /^[A-Z0-9_]+$/.test(args[0]) ? args.shift() : 'PARABANK';
const phases = args.length ? args : ['smoke', 'suites', 'journey'];
const e = (k) => process.env[`${prefix}_${k}`] || '';

const vars = {
  baseUrl: `${process.env.BASE_URL}/services/bank`,
  username: e('USERNAME'), password: e('PASSWORD'), ssn: e('SSN'),
  firstName: e('FIRST_NAME'), lastName: e('LAST_NAME'), street: e('STREET'), city: e('CITY'),
  state: e('STATE'), zipCode: e('ZIP'), phoneNumber: e('PHONE'),
  fallbackAccountId: e('FALLBACK_ACCOUNT_ID'),
};
const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`Missing ${prefix}_* values in .env: ${missing.join(', ')}`); process.exit(2); }

const secrets = [vars.password, vars.ssn];
const encodings = (s) => [...new Set([s, encodeURIComponent(s), new URLSearchParams({ x: s }).toString().slice(2), JSON.stringify(s).slice(1, -1)])];
const redact = (text) => secrets.reduce((t, s) => encodings(s).reduce((u, enc) => u.split(enc).join('<REDACTED>'), t), text);

const PHASE_ITEMS = {
  smoke: ['00 Smoke'],
  suites: ['10 Suite fixtures', '11 LOG Login', '12 CUS Customer', '13 ACC Accounts', '14 TRF Transfer', '15 DEP Deposit',
    '16 WDR Withdraw', '17 BIL Bill pay', '18 LON Loan', '19 TRX Transactions'],
  journey: ['01 Customer Journey'],
};

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join('evidence', 'stage3', runId);
mkdirSync(outDir, { recursive: true });

function redactTree(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) redactTree(p);
    else writeFileSync(p, redact(readFileSync(p, 'utf8')));
  }
}

const summary = [];
for (const phase of phases) {
  const items = PHASE_ITEMS[phase];
  if (!items) { console.error(`Unknown phase ${phase}`); process.exit(2); }
  const reportDir = join(outDir, `${phase}-report`);
  const cliArgs = ['collection', 'run', 'postman/ParaBank_QA.postman_collection.json',
    '-e', 'postman/ParaBank_QA.postman_environment.json',
    ...items.flatMap((i) => ['-i', i]),
    ...Object.entries(vars).flatMap(([k, v]) => ['--env-var', `${k}=${v}`]),
    '--env-var', `runId=${runId}`,
    '--delay-request', '1500', '--timeout-request', '5000',
    '--no-report-events', '--output', reportDir];
  const started = Date.now();
  const r = spawnSync('postman', cliArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  const log = redact(`${r.stdout || ''}${r.stderr || ''}`);
  writeFileSync(join(outDir, `${phase}.log`), log);
  try { redactTree(reportDir); } catch { /* no report written */ }
  const secs = Math.round((Date.now() - started) / 1000);
  summary.push({ phase, exitCode: r.status, seconds: secs });
  console.log(`${phase}: exit ${r.status} in ${secs}s -> ${join(outDir, `${phase}.log`)}`);
  if (phase === 'smoke' && r.status !== 0) {
    console.log('Smoke failed: stopping. Suites and journey are BLOCKED.');
    break;
  }
}
writeFileSync(join(outDir, 'phases.json'), `${JSON.stringify({ runId, user: vars.username, phases: summary }, null, 2)}\n`);

// Per-case verdicts and NFR-01 report -> <outDir>/results.md
spawnSync('node', ['scripts/summarize-stage3.mjs', outDir], { stdio: 'inherit' });
console.log(`Evidence: ${outDir}`);
process.exit(summary.every((p) => p.exitCode === 0) ? 0 : 1);
