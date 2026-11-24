// Isolation of the load-test reconciliation failure (Stage 4 workflow, applied to L4):
// does POST /transfer lose balance updates when several transfers from the same account run at once?
//
// Fresh throwaway customer, accounts S and T. Then:
//   control  5 sequential transfers S → T (1.00, paced 1.5 s)       snapshot
//   round N  5 simultaneous transfers S → T (1.00), 3 rounds 7.5 s apart, snapshot after each round
// Each snapshot compares the balance with the sum of the account's own transactions.
//
// Output: results/runs/<UTC>-load/ (scope "concurrency isolation"): isolation.json, summary.md
// Usage:  node --env-file=.env tests/load/isolate-concurrency.mjs

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API, http, sleep, newRun, rebuildIndex } from '../scripts/lib/common.mjs';
import { setupFixture } from './setup-load.mjs';

const run = newRun('load', { scope: 'concurrency isolation' });
const fx = await setupFixture();
const steps = [];

async function state(id) {
  const a = await http('GET', `/accounts/${id}`);
  const t = await http('GET', `/accounts/${id}/transactions`);
  const sum = t.json.reduce((s, x) => s + (x.type === 'Credit' ? 1 : -1) * Math.round(x.amount * 100), 0);
  return { balance: Math.round(a.json.balance * 100), historySum: sum, transactions: t.json.length };
}
async function snap(label, sent, ok) {
  const S = await state(fx.S); const T = await state(fx.T);
  const prev = steps.at(-1) || { S: fx.before.S, T: fx.before.T, init: true };
  const sPrev = prev.init ? fx.before.S.cents : prev.S.balance;
  const tPrev = prev.init ? fx.before.T.cents : prev.T.balance;
  const row = { label, sent, ok, S, T, dS: S.balance - sPrev, dT: T.balance - tPrev,
    lost: (S.balance - S.historySum) / 100, totalDrift: (S.balance + T.balance - fx.before.S.cents - fx.before.T.cents) / 100 };
  steps.push(row);
  console.log(`${label.padEnd(10)} sent ${sent} ok ${ok} | S Δ ${(row.dS / 100).toFixed(2)} T Δ ${(row.dT / 100).toFixed(2)} | S balance − S history = ${row.lost.toFixed(2)} | S+T drift ${row.totalDrift.toFixed(2)}`);
}
const fire = () => fetch(`${API}/transfer?fromAccountId=${fx.S}&toAccountId=${fx.T}&amount=1.00`, { method: 'POST', headers: { Accept: 'application/json' } })
  .then(async (r) => ({ status: r.status, ok: r.status === 200 && (await r.text()).includes('Successfully transferred $1.00') }));

// control: sequential
let ok = 0;
for (let i = 0; i < 5; i++) { ok += (await http('POST', '/transfer', { query: { fromAccountId: fx.S, toAccountId: fx.T, amount: '1.00' } })).text.includes('Successfully') ? 1 : 0; }
await snap('control', 5, ok);

// concurrent rounds
for (let r = 1; r <= 3; r++) {
  await sleep(7500);
  const res = await Promise.all(Array.from({ length: 5 }, fire));
  await snap(`round ${r}`, 5, res.filter((x) => x.ok).length);
}

const md = [
  `# Concurrency isolation — run ${run.id}`, '',
  `Throwaway customer ${fx.customerId}; S ${fx.S} (start ${(fx.before.S.cents / 100).toFixed(2)}), T ${fx.T} (start ${(fx.before.T.cents / 100).toFixed(2)}). Every transfer is 1.00 S → T.`, '',
  '| Step | Transfers sent | Confirmed (200 + success text) | S balance change | T balance change | S balance − sum of S history | S + T drift since start |',
  '|---|---|---|---|---|---|---|',
  ...steps.map((s) => `| ${s.label} | ${s.sent} | ${s.ok} | ${(s.dS / 100).toFixed(2)} | ${(s.dT / 100).toFixed(2)} | ${s.lost.toFixed(2)} | ${s.totalDrift.toFixed(2)} |`),
  '', 'Expected for every step: S change = −confirmed, T change = +confirmed, balance − history = 0.00, drift = 0.00.', '',
];
writeFileSync(join(run.dir, 'summary.md'), md.join('\n'));
writeFileSync(join(run.dir, 'isolation.json'), `${JSON.stringify({ fixture: fx, steps }, null, 2)}\n`);
const lost = steps.at(-1).lost;
run.update({ finished: new Date().toISOString(), counts: { 'lost updates (1.00 each)': lost }, fixture: { customerId: fx.customerId, S: fx.S, T: fx.T } });
rebuildIndex();
console.log(`Run: ${run.dir}`);
