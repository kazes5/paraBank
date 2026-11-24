// Load-test session (plan.md Stage 5, tests/load/load_test_plan.md):
//   smoke gate → fixture → L1 → L2 → L3 → L4 → (L5) → L6 reconciliation + smoke
// with a pause between scenarios so the CDN's rate-limit window resets, and the stop rules of §5.
//
// Output: results/runs/<UTC>-load/ (run.json, fixture.json, summary.md, results.json, raw/, logs/)
// Usage:  ./run.sh load [--dry]      --dry = 2 requests per scenario, 5 s pauses, no smoke runs

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newRun, rebuildIndex, sleep, BASE } from '../scripts/lib/common.mjs';
import { setupFixture, snapshot } from './setup-load.mjs';
import { readRaw, analyse, reconcile, writeSummary } from './reconcile.mjs';

const dry = process.argv.includes('--dry');
const PAUSE = dry ? 5 : Number(process.env.LOAD_PAUSE || 120);
const TESTS = [
  { test: 'L1', script: 'get_account.k6.js' },
  { test: 'L2', script: 'get_account.k6.js' },
  { test: 'L3', script: 'transfer.k6.js' },
  { test: 'L4', script: 'transfer.k6.js' },
  { test: 'L5', script: 'mixed.k6.js', optional: true },
];

const smoke = () => {
  if (dry) return 'skipped (dry run)';
  const r = spawnSync('./run.sh', ['smoke'], { encoding: 'utf8' });
  return r.status === 0 ? 'PASS' : 'FAIL';
};

// ---------------------------------------------------------------- gate and fixture
console.log('Smoke gate…');
const gate = smoke();
if (gate === 'FAIL') { console.error('Smoke failed: no load test (BLOCKED). After a site reset, run ./run.sh setup first.'); process.exit(3); }

const run = newRun('load', { scope: dry ? 'dry run' : 'L1–L6', dry });
console.log(`Run: ${run.dir}\nFixture: throwaway customer, accounts S and T…`);
const fixture = await setupFixture();
writeFileSync(join(run.dir, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`  customer ${fixture.customerId}, S ${fixture.S} (${fixture.before.S.balance}), T ${fixture.T} (${fixture.before.T.balance})`);

// ---------------------------------------------------------------- scenarios
const raw = run.sub('raw');
const logs = run.sub('logs');
const results = [];
const notes = [];
const baseline = {};
let limitedRuns = 0;
let stopAll = false;

for (const [i, t] of TESTS.entries()) {
  if (stopAll) { results.push({ test: t.test, rows: [], skipped: 'session stopped' }); continue; }
  if (t.optional && results.some((r) => r.raw?.rateLimited)) {
    notes.push(`${t.test} skipped: optional, and an earlier test was rate-limited (plan §4).`);
    results.push({ test: t.test, rows: [] }); continue;
  }
  if (i > 0) { console.log(`Pause ${PAUSE} s…`); await sleep(PAUSE * 1000); }
  console.log(`${t.test}…`);
  const out = join(raw, `${t.test}.json`);
  const args = ['run', '--quiet', '--no-color', '--out', `json=${out}`,
    '-e', `TEST=${t.test}`, '-e', `S=${fixture.S}`, '-e', `T=${fixture.T}`, '-e', `BASE_URL=${BASE}`,
    ...(dry ? ['--vus', '1', '--iterations', '2'] : []), join('tests/load', t.script)];
  const k = spawnSync('k6', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(logs, `${t.test}.log`), `${k.stdout || ''}${k.stderr || ''}`);
  const data = readRaw(out);
  const rows = analyse(t.test, data, baseline);
  const failedChecks = Object.entries(data.checks.filter((c) => !c.ok).reduce((a, c) => ({ ...a, [c.check]: (a[c.check] || 0) + 1 }), {}))
    .map(([c, n]) => `${c} ×${n}`).join('; ');
  const snapAfter = await snapshot(fixture); // per-test balances: a reconciliation gap can be traced to its test
  results.push({ test: t.test, exit: k.status, rows, raw: data, failed: failedChecks, after: snapAfter });
  if (t.test === 'L1' || t.test === 'L3') for (const r of rows.filter((x) => x.label === t.test && x.p95)) baseline[r.name] = r.p95;
  for (const r of rows.filter((x) => x.label === t.test)) console.log(`  ${r.name}: n ${r.n}, p95 ${r.p95} ms, errors ${r.errorRate} %, 429 ${r.limited} → ${r.verdict}`);
  if (k.status !== 0 && k.status !== 99) notes.push(`${t.test}: k6 exited with ${k.status} (see logs/${t.test}.log).`);
  if (k.status === 99) notes.push(`${t.test}: stopped by a stop rule (§5)${data.rateLimited ? ` — ${data.rateLimited} × HTTP 429 (Cloudflare)` : ''}.`);
  if (data.rateLimited) {
    limitedRuns++;
    if (t.test === 'L2') {
      const lastStep = Math.max(...data.req.filter((x) => x.status === 429).map((x) => x.step));
      notes.push(`L2 reached Cloudflare's limit in step ${lastStep}; steps before it are the highest rates measured without blocking.`);
    }
    if (limitedRuns >= 2) { stopAll = true; notes.push('429 in two tests: session stopped for the day (plan §5).'); }
  } else limitedRuns = 0;
}

// ---------------------------------------------------------------- L6
console.log('L6 reconciliation…');
await sleep(dry ? 2000 : 15000);
const after = await snapshot(fixture);
const ok = results.reduce((a, r) => a + (r.raw?.transferOk || 0), 0);
const unsure = results.reduce((a, r) => a + (r.raw?.transferUnsure || 0), 0);
const recon = { ...reconcile(fixture.before, after, { ok, unsure }), after, transfers: { ok, unsure } };
console.log('Smoke after load…');
const smokeAfter = smoke();

const md = writeSummary(run.dir, { runId: run.id, fixture, results, recon, smokeAfter, notes });
const verdicts = results.flatMap((r) => r.rows.filter((x) => x.label === r.test).map((x) => x.verdict.split(' ')[0]));
const counts = verdicts.reduce((a, v) => ({ ...a, [v]: (a[v] || 0) + 1 }), {});
counts[`RECON ${recon.verdict}`] = 1;
run.update({ finished: new Date().toISOString(), fixture: { customerId: fixture.customerId, S: fixture.S, T: fixture.T }, counts, reconciliation: recon.verdict, smokeAfter });
rebuildIndex();
writeFileSync('results/.last-run', `${run.id}\n`); // the after-load smoke run must not become the run that --keep keeps
console.log(md.slice(6).join('\n'));
console.log(`Run: ${run.dir}`);
process.exit(recon.verdict === 'PASS' && !verdicts.includes('FAIL') ? 0 : 1);
