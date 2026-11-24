// End of ./run.sh cycle: decides whether the cycle is complete, and only then keeps and publishes it.
//
// The public site resets now and then (users and accounts disappear), sometimes in the middle of a
// cycle. Step exit codes can't tell "defects found" (1) from "crashed" (also 1), so completeness is
// judged from the runs this cycle wrote (started at or after --since):
//   - one complete run of every layer (API, UI, manual, coded tests, load, reproduction; the isolation
//     run too when the load reconciliation failed), as defined by RUN_TYPES;
//   - nothing BLOCKED in the API run, no manual case BLOCKED by a script error (AUTH-05's firewall
//     block is a known environment result), no reproduction step answered by a rate limit or gateway.
// Complete + --keep: every complete run of the cycle is kept (moved to results/kept/) and the defect
// bundles of its reproduction run are published to evidence/bugs/; the cycle then publishes the STR
// and refreshes the documents. Incomplete: nothing is kept or published (exit 3, BLOCKED).
//
// Usage: node tests/scripts/cycle-finish.mjs --since <ISO> [--keep]

import { readFileSync, existsSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { allRuns, RUN_TYPES, keepRun, rebuildIndex } from './lib/common.mjs';

const args = process.argv.slice(2);
const since = args[args.indexOf('--since') + 1];
const keep = args.includes('--keep');
if (!since || Number.isNaN(Date.parse(since))) {
  console.error('Usage: cycle-finish.mjs --since <ISO> [--keep]');
  process.exit(2);
}

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const runs = allRuns().filter((r) => Date.parse(r.started || 0) >= Date.parse(since));
const pick = (key) => runs.filter(RUN_TYPES.find((t) => t.key === key).test).at(-1);

const problems = [];
const chosen = {};
for (const key of ['api', 'ui', 'manual', 'auto', 'load', 'repro']) {
  chosen[key] = pick(key);
  if (!chosen[key]) problems.push(`${key}: no complete run in this cycle`);
}
// The isolation run is part of the cycle only when the load reconciliation failed.
if (chosen.load?.reconciliation === 'FAIL') {
  // An isolation run that crashed has no isolation.json: it does not count.
  chosen.isolation = runs
    .filter((r) => RUN_TYPES.find((t) => t.key === 'isolation').test(r) && existsSync(join(r.dir, 'isolation.json')))
    .at(-1);
  if (!chosen.isolation) problems.push('isolation: load reconciliation failed but no isolation run');
}

// Layer-specific signs of a site reset or a crash.
if (chosen.api?.counts?.BLOCKED) problems.push(`api: ${chosen.api.counts.BLOCKED} case(s) BLOCKED (site reset?)`);
if (chosen.ui && !Object.keys(chosen.ui.counts || {}).length) problems.push('ui: no comparisons recorded');
// pytest records only the tests that ran: fewer results than the last kept run means some crashed.
const total = (r) => Object.values(r?.counts || {}).reduce((a, n) => a + n, 0);
const prevAuto = allRuns()
  .filter((r) => r.kept && r.kind === 'auto' && r.id !== chosen.auto?.id)
  .at(-1);
if (chosen.auto && prevAuto && total(chosen.auto) < total(prevAuto))
  problems.push(`auto: ${total(chosen.auto)} test results, the last kept run had ${total(prevAuto)}`);
if (chosen.auto?.counts?.ERROR) problems.push(`auto: ${chosen.auto.counts.ERROR} test(s) errored`);
const manual = chosen.manual && readJson(join(chosen.manual.dir, 'results.json'));
for (const m of manual?.results || [])
  if (m.verdict === 'BLOCKED' && /script error/i.test(m.observation || ''))
    problems.push(`manual: ${m.id} BLOCKED by a script error`);
if (chosen.repro) {
  if (!existsSync(join(chosen.repro.dir, 'summary.md'))) problems.push('repro: run did not finish');
  const trouble = readdirSync(chosen.repro.dir)
    .filter((d) => /^(BUG-\d+|S-LOAN)$/.test(d) && existsSync(join(chosen.repro.dir, d, 'repro.json')))
    .flatMap((d) => readJson(join(chosen.repro.dir, d, 'repro.json')).steps)
    .filter((s) => s.status === 429 || (s.status >= 502 && s.status <= 504) || (s.status >= 520 && s.status <= 530));
  if (trouble.length) problems.push(`repro: ${trouble.length} response(s) were rate limits or gateway errors`);
}

console.log('Cycle runs:');
for (const [k, r] of Object.entries(chosen)) console.log(`  ${k.padEnd(9)} ${r ? r.id : '—'}`);
if (problems.length) {
  console.error(`Cycle INCOMPLETE (BLOCKED): nothing kept or published.\n  ${problems.join('\n  ')}`);
  console.error('Usually a site reset: run ./run.sh cycle --keep again (it starts with setup).');
  process.exit(3);
}
console.log('Cycle complete.');
if (!keep) process.exit(0);

// Keep every complete run of the cycle (smoke-gate runs of the load test stay local), then publish
// the reproduction bundles (as ./run.sh repro --publish would have done).
for (const r of Object.values(chosen)) if (!r.kept) console.log(`Kept: ${keepRun(r.id).dir}`);
const repro = allRuns().find((r) => r.id === chosen.repro.id);
const bundles = readdirSync(repro.dir).filter(
  (d) => /^(BUG-\d+|S-LOAN)$/.test(d) && statSync(join(repro.dir, d)).isDirectory(),
);
for (const b of bundles) cpSync(join(repro.dir, b), join('evidence', 'bugs', b), { recursive: true });
console.log(`Published ${bundles.length} defect bundles from ${repro.id} to evidence/bugs/`);
rebuildIndex();
