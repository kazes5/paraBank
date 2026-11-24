// Load-test session (plan.md Stage 5, deliverables/load_test_plan.md):
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

// Options: --dry checks the wiring with 2 requests per test; LOAD_PAUSE overrides the 120 s pause.
// TESTS: the k6 scenarios in order; L5 is optional and skipped if an earlier test was rate-limited.
const dry = process.argv.includes('--dry');
const PAUSE = dry ? 5 : Number(process.env.LOAD_PAUSE || 120);
const TESTS = [
  { test: 'L1', script: 'get_account.k6.js' },
  { test: 'L2', script: 'get_account.k6.js' },
  { test: 'L3', script: 'transfer.k6.js' },
  { test: 'L4', script: 'transfer.k6.js' },
  { test: 'L5', script: 'mixed.k6.js', optional: true },
];

// Smoke check through run.sh (Postman collection): PASS / FAIL, skipped in a dry run.
const smoke = () => {
  if (dry) return 'skipped (dry run)';
  const r = spawnSync('./run.sh', ['smoke'], { encoding: 'utf8' });
  return r.status === 0 ? 'PASS' : 'FAIL';
};

// ---------------------------------------------------------------- gate and fixture
// Gate: no load test against a site that already fails smoke (exit 3 = BLOCKED, nothing to keep).
console.log('Smoke gate…');
const gate = smoke();
if (gate === 'FAIL') {
  console.error('Smoke failed: no load test (BLOCKED). After a site reset, run ./run.sh setup first.');
  process.exit(3);
}

// Run folder and fixture (throwaway customer with S and T), saved as fixture.json.
const run = newRun('load', { scope: dry ? 'dry run' : 'L1–L6', dry });
console.log(`Run: ${run.dir}\nFixture: throwaway customer, accounts S and T…`);
// A site reset (the public sandbox wipes its data periodically) makes the fixture accounts disappear:
// the run is then BLOCKED, not a result. It is recorded as such and exits 3, so --keep does not keep it.
function blockedByReset(when, err) {
  const why = `${when}: ${err.message} (the site most likely reset its data; run ./run.sh setup and retry)`;
  writeFileSync(join(run.dir, 'summary.md'), `# Load test — run ${run.id}\n\n**BLOCKED.** ${why}\n`);
  run.update({ verdict: 'BLOCKED', blocked: why, counts: { BLOCKED: 1 }, finished: new Date().toISOString() });
  rebuildIndex();
  console.error(`BLOCKED: ${why}`);
  process.exit(3);
}
const fixture = await setupFixture().catch((e) => blockedByReset('fixture setup', e));
writeFileSync(join(run.dir, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `  customer ${fixture.customerId}, S ${fixture.S} (${fixture.before.S.balance}), T ${fixture.T} (${fixture.before.T.balance})`,
);

// ---------------------------------------------------------------- scenarios
// Per-test state: k6 raw output (raw/), console logs (logs/), results, notes for the summary,
// the L1/L3 p95 baselines used to judge L2/L4, and the rate-limit stop rule counters.
const raw = run.sub('raw');
const logs = run.sub('logs');
const results = [];
const notes = [];
const toolErrors = []; // tests whose k6 process failed (exit code other than 0 or 99)
const baseline = {};
let limitedRuns = 0;
let stopAll = false;
let integrityStop = null; // set when a test leaves a balance gap: nothing else starts (plan §5)
let prevSnap = fixture.before;

for (const [i, t] of TESTS.entries()) {
  // Stop rules: after 429s in two tests nothing else runs; optional L5 is skipped after any 429.
  if (stopAll) {
    results.push({ test: t.test, rows: [], skipped: 'session stopped' });
    continue;
  }
  if (integrityStop) {
    notes.push(`${t.test} not started: ${integrityStop} (plan §5: nothing else starts after a wrong balance).`);
    results.push({ test: t.test, rows: [], skipped: 'balance gap' });
    continue;
  }
  if (t.optional && results.some((r) => r.raw?.rateLimited)) {
    notes.push(`${t.test} skipped: optional, and an earlier test was rate-limited (plan §4).`);
    results.push({ test: t.test, rows: [] });
    continue;
  }
  // Pause between tests so the CDN's rate-limit window resets.
  if (i > 0) {
    console.log(`Pause ${PAUSE} s…`);
    await sleep(PAUSE * 1000);
  }
  console.log(`${t.test}…`);
  const out = join(raw, `${t.test}.json`);
  // k6 command: quiet console, raw JSON output for analysis, the test ID and fixture accounts as -e values.
  const args = [
    'run',
    '--quiet',
    '--no-color',
    '--out',
    `json=${out}`,
    '-e',
    `TEST=${t.test}`,
    '-e',
    `S=${fixture.S}`,
    '-e',
    `T=${fixture.T}`,
    '-e',
    `BASE_URL=${BASE}`,
    ...(dry ? ['--vus', '1', '--iterations', '2'] : []),
    join('tests/load', t.script),
  ];
  const k = spawnSync('k6', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(logs, `${t.test}.log`), `${k.stdout || ''}${k.stderr || ''}`);
  // Analyse the raw output: per-endpoint / per-step stats with verdicts, and failed checks counted by name.
  const data = readRaw(out);
  const rows = analyse(t.test, data, baseline);
  const failedChecks = Object.entries(
    data.checks.filter((c) => !c.ok).reduce((a, c) => ({ ...a, [c.check]: (a[c.check] || 0) + 1 }), {}),
  )
    .map(([c, n]) => `${c} ×${n}`)
    .join('; ');
  const snapAfter = await snapshot(fixture).catch((e) => blockedByReset(`balances after ${t.test}`, e)); // per-test balances: a reconciliation gap can be traced to its test
  // Stop rule (plan §5): if S + T changed, money was created or lost; this test ran to the end, but no
  // further test starts. Reads (L1, L2) cannot cause a gap, so any gap points at the write tests.
  const gap = snapAfter.S.cents - prevSnap.S.cents + (snapAfter.T.cents - prevSnap.T.cents);
  if (gap) integrityStop = `${t.test} left a balance gap of ${(gap / 100).toFixed(2)} (S + T changed)`;
  prevSnap = snapAfter;
  results.push({ test: t.test, exit: k.status, rows, raw: data, failed: failedChecks, after: snapAfter });
  // L1 and L3 are the baselines: their p95 per endpoint is what L2 and L4 are compared against.
  if (t.test === 'L1' || t.test === 'L3')
    for (const r of rows.filter((x) => x.label === t.test && x.p95)) baseline[r.name] = r.p95;
  for (const r of rows.filter((x) => x.label === t.test))
    console.log(`  ${r.name}: n ${r.n}, p95 ${r.p95} ms, errors ${r.errorRate} %, 429 ${r.limited} → ${r.verdict}`);
  // Notes for the summary: k6 errors, stop-rule aborts (exit 99), and where L2 hit the rate limit.
  // k6 exit 0 = ran to the end, 99 = stopped by a stop-rule threshold (reported above as such);
  // anything else is a tool or script error: the test's numbers cannot be trusted and the session fails.
  if (k.status !== 0 && k.status !== 99) {
    notes.push(`${t.test}: k6 exited with ${k.status} (see logs/${t.test}.log): ERROR, the session fails.`);
    toolErrors.push(t.test);
  }
  if (k.status === 99)
    notes.push(
      `${t.test}: stopped by a stop rule (§5)${data.rateLimited ? ` — ${data.rateLimited} × HTTP 429 (Cloudflare)` : ''}.`,
    );
  if (data.rateLimited) {
    limitedRuns++;
    if (t.test === 'L2') {
      const lastStep = Math.max(...data.req.filter((x) => x.status === 429).map((x) => x.step));
      notes.push(
        `L2 reached Cloudflare's limit in step ${lastStep}; steps before it are the highest rates measured without blocking.`,
      );
    }
    if (limitedRuns >= 2) {
      stopAll = true;
      notes.push('429 in two tests: session stopped for the day (plan §5).');
    }
  } else limitedRuns = 0;
}

// ---------------------------------------------------------------- L6
// L6: wait for the last writes to settle, then compare the money that moved (S and T balances)
// with the transfers k6 confirmed; finish with a smoke check that the site is still healthy.
console.log('L6 reconciliation…');
await sleep(dry ? 2000 : 15000);
const after = await snapshot(fixture).catch((e) => blockedByReset('L6 reconciliation', e));
const ok = results.reduce((a, r) => a + (r.raw?.transferOk || 0), 0);
const unsure = results.reduce((a, r) => a + (r.raw?.transferUnsure || 0), 0);
const recon = { ...reconcile(fixture.before, after, { ok, unsure }), after, transfers: { ok, unsure } };
console.log('Smoke after load…');
const smokeAfter = smoke();

// Session verdict: FAIL when reconciliation failed, a test failed its SLA, k6 itself failed, or the site
// is unhealthy after the load (smoke FAIL); otherwise PASS. Written to run.json and summary.md.
const verdicts = results.flatMap((r) => r.rows.filter((x) => x.label === r.test).map((x) => x.verdict.split(' ')[0]));
const counts = verdicts.reduce((a, v) => ({ ...a, [v]: (a[v] || 0) + 1 }), {});
counts[`RECON ${recon.verdict}`] = 1;
if (toolErrors.length) counts.ERROR = toolErrors.length;
const reasons = [
  recon.verdict !== 'PASS' && 'reconciliation FAIL',
  verdicts.includes('FAIL') && 'a test failed its SLA',
  toolErrors.length && `k6 failed in ${toolErrors.join(', ')}`,
  smokeAfter === 'FAIL' && 'smoke after load FAIL',
].filter(Boolean);
const sessionVerdict = reasons.length ? 'FAIL' : 'PASS';
notes.push(`Session verdict: ${sessionVerdict}${reasons.length ? ` (${reasons.join('; ')})` : ''}.`);
const md = writeSummary(run.dir, { runId: run.id, fixture, results, recon, smokeAfter, notes });
run.update({
  verdict: sessionVerdict,
  slaVerdicts: [...new Set(verdicts)],
  finished: new Date().toISOString(),
  fixture: { customerId: fixture.customerId, S: fixture.S, T: fixture.T },
  counts,
  reconciliation: recon.verdict,
  smokeAfter,
});
rebuildIndex();
writeFileSync('results/.last-run', `${run.id}\n`); // the after-load smoke run must not become the run that --keep keeps
console.log(md.slice(6).join('\n'));
console.log(`Run: ${run.dir}`);
process.exit(sessionVerdict === 'PASS' ? 0 : 1);
