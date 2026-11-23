// Stage 3 step 4 (plan.md §3.3): cross-check J09, J10, J13 and TRF-01 in the ParaBank web UI.
//
// Logs in through the web UI with local Chrome (Playwright, channel "chrome"), reads the
// Accounts Overview and each account's Activity page, and compares them with the REST API
// at the same moment: balances, account types, and every transaction (type, amount, description).
// Then checks that the specific operations from the official Stage 3 run are visible in the UI.
//
// Credentials come from .env and are never printed; screenshots show no password or SSN.
// Output: evidence/stage3-ui/ (crosscheck.md, crosscheck.json, screenshots)
//
// Usage: node --env-file=.env scripts/stage3-ui-crosscheck.mjs [PREFIX]

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const prefix = process.argv[2] || 'PARABANK';
const e = (k) => process.env[`${prefix}_${k}`];
const web = process.env.BASE_URL;
const api = `${web}/services/bank`;
const OUT = 'evidence/stage3-ui';
mkdirSync(OUT, { recursive: true });

// Accounts and operations of the official run evidence/stage3/2026-11-23T16-04-00-002Z
const RUN = 'evidence/stage3/2026-11-23T16-04-00-002Z';
const ACC = { A: 54192, B: 75504, L: 75726, S: 72174, T: 72285 };
const EXPECT = [
  { step: 'J09', what: 'transfer 50.00 B → A', account: 'B', type: 'Debit', cents: 5000, desc: /Funds Transfer Sent/ },
  { step: 'J09', what: 'transfer 50.00 B → A', account: 'A', type: 'Credit', cents: 5000, desc: /Funds Transfer Received/ },
  { step: 'J10', what: 'bill payment 30.00 from A to City Utilities', account: 'A', type: 'Debit', cents: 3000, desc: /Bill Payment to City Utilities/ },
  { step: 'J13', what: 'loan down payment 50.00 from A', account: 'A', type: 'Debit', cents: 5000, desc: /Down Payment/i },
  { step: 'TRF-01', what: 'transfer 1.00 S → T', account: 'S', type: 'Debit', cents: 100, desc: /Funds Transfer Sent/ },
  { step: 'TRF-01', what: 'transfer 1.00 S → T', account: 'T', type: 'Credit', cents: 100, desc: /Funds Transfer Received/ },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cents = (s) => Math.round(Number(String(s).replace(/[$,\s]/g, '')) * 100);
const secrets = [e('PASSWORD'), e('SSN')].filter(Boolean);
const redact = (s) => secrets.reduce((t, x) => t.split(x).join('<REDACTED>'), String(s));

async function apiGet(path) {
  await sleep(1500); // site rate limit (O6)
  const r = await fetch(api + path, { headers: { Accept: 'application/json' } });
  if (r.status !== 200) throw new Error(`API ${path}: HTTP ${r.status}`);
  return r.json();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

// ---- login through the UI form
await page.goto(`${web}/index.htm`);
await page.fill('input[name="username"]', e('USERNAME'));
await page.fill('input[name="password"]', e('PASSWORD'));
await Promise.all([page.waitForNavigation(), page.click('input[type="submit"][value="Log In"]')]);
const welcome = (await page.textContent('#leftPanel').catch(() => '')) || '';
if (!/Welcome/.test(welcome)) {
  await shot('login-failed');
  throw new Error('UI login failed (see login-failed.png)');
}

// ---- Accounts Overview
await page.goto(`${web}/overview.htm`);
await page.waitForSelector('#accountTable tbody tr td a');
const overview = await page.$$eval('#accountTable tbody tr', (rows) => rows
  .map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent.trim()))
  .filter((c) => /^\d+$/.test(c[0]))
  .map((c) => ({ id: Number(c[0]), balance: c[1], available: c[2] })));
await shot('overview');

// ---- Activity page per account
async function activity(name, id) {
  await page.goto(`${web}/activity.htm?id=${id}`);
  await page.waitForFunction(() => document.querySelector('#accountType')?.textContent.trim());
  await page.waitForTimeout(1500); // transaction table is filled by a second request
  const details = await page.evaluate(() => ({
    id: document.querySelector('#accountId')?.textContent.trim(),
    type: document.querySelector('#accountType')?.textContent.trim(),
    balance: document.querySelector('#balance')?.textContent.trim(),
    available: document.querySelector('#availableBalance')?.textContent.trim(),
  }));
  const rows = await page.$$eval('#transactionTable tbody tr', (trs) => trs
    .map((r) => [...r.querySelectorAll('td')])
    .filter((td) => td.length >= 4)
    .map((td) => ({
      date: td[0].textContent.trim(),
      description: td[1].textContent.trim(),
      id: Number((td[1].querySelector('a')?.getAttribute('href') || '').replace(/.*id=/, '')) || null,
      debit: td[2].textContent.trim(),
      credit: td[3].textContent.trim(),
    })));
  await shot(`activity-${name}-${id}`);
  return { ...details, rows: rows.map((r) => ({ ...r, type: r.debit ? 'Debit' : 'Credit', cents: cents(r.debit || r.credit) })) };
}

const ui = {};
for (const [name, id] of Object.entries(ACC)) ui[name] = await activity(name, id);
await browser.close();

// ---- API at the same moment
const customerId = (await apiGet(`/login/${encodeURIComponent(e('USERNAME'))}/${encodeURIComponent(e('PASSWORD'))}`)).id;
const apiAccounts = await apiGet(`/customers/${customerId}/accounts`);
const apiTrx = {};
for (const [name, id] of Object.entries(ACC)) apiTrx[name] = await apiGet(`/accounts/${id}/transactions`);

// ---- compare
const checks = [];
const check = (area, label, ok, detail, fail = 'MISMATCH') => checks.push({ area, label, result: ok ? 'MATCH' : fail, detail });
const sig = (r) => `${r.id} ${r.type} ${r.cents}`;

const apiIds = apiAccounts.map((a) => a.id).sort((x, y) => x - y);
const uiIds = overview.map((a) => a.id).sort((x, y) => x - y);
check('Overview', 'same accounts in UI and API', JSON.stringify(uiIds) === JSON.stringify(apiIds), `UI ${uiIds.length}, API ${apiIds.length}`);
for (const a of apiAccounts) {
  const o = overview.find((x) => x.id === a.id);
  if (o && cents(o.balance) !== Math.round(a.balance * 100)) check('Overview', `balance of ${a.id}`, false, `UI ${o.balance}, API ${a.balance}`);
}
check('Overview', 'every balance equal in UI and API', !checks.some((c) => c.area === 'Overview' && c.label.startsWith('balance of')), `${apiAccounts.length} accounts compared`);

for (const [name, id] of Object.entries(ACC)) {
  const a = apiAccounts.find((x) => x.id === id);
  const u = ui[name];
  check(`Account ${name} (${id})`, 'type and balance', a && u.type === a.type && cents(u.balance) === Math.round(a.balance * 100), `UI ${u.type} ${u.balance}, API ${a?.type} ${a?.balance}`);
  const apiSig = apiTrx[name].map((r) => sig({ id: r.id, type: r.type, cents: Math.round(r.amount * 100) })).sort();
  const uiSig = u.rows.map(sig).sort();
  check(`Account ${name} (${id})`, 'same transactions (id, type, amount)', JSON.stringify(apiSig) === JSON.stringify(uiSig), `UI ${uiSig.length} rows, API ${apiSig.length} rows`);
  const descDiff = apiTrx[name].filter((r) => { const x = u.rows.find((y) => y.id === r.id); return x && x.description !== r.description; });
  check(`Account ${name} (${id})`, 'same descriptions', descDiff.length === 0, descDiff.length ? JSON.stringify(descDiff.map((r) => r.id)) : `${apiTrx[name].length} compared`);
}

// A and S also hold rows from earlier runs today; transaction ids only grow, so the official run's rows
// are the ones newer than the first row of an account created in that run (B for the journey, S/T for TRF)
const sinceId = { A: Math.min(...ui.B.rows.map((r) => r.id)), B: 0, L: 0, S: 0, T: 0 };
for (const x of EXPECT) {
  const hit = ui[x.account].rows.filter((r) => r.id >= sinceId[x.account] && r.type === x.type && r.cents === x.cents && x.desc.test(r.description))
    .filter((r) => x.step !== 'J13' || r.description.includes(String(ACC.L)))
    .slice(0, 1);
  check(x.step, `${x.what}: ${x.type} ${(x.cents / 100).toFixed(2)} on ${x.account} visible in UI`, hit.length >= 1,
    hit.length ? hit.map((r) => `${r.date} "${r.description}" #${r.id}`).join('; ') : 'not found');
}
check('J13', 'loan account shown as LOAN in UI', ui.L.type === 'LOAN', `UI type ${ui.L.type}, balance ${ui.L.balance}`);
check('J13', 'loan recorded in the loan account history (rule A12)', ui.L.rows.length > 0,
  `UI and API agree: ${ui.L.rows.length} rows in UI, ${apiTrx.L.length} in API. Same gap as LOAN-01 / J13e, not a UI-only problem`, 'RULE NOT MET (A12)');

// ---- write
const at = new Date().toISOString();
const mismatches = checks.filter((c) => c.result === 'MISMATCH');
const md = [
  '# Web UI cross-check (Stage 3, step 4)',
  '',
  `Run at ${at} as ${e('USERNAME')} (customer ${customerId}) with local Chrome via Playwright; each UI page was compared with the REST API read seconds later.`,
  `Accounts from the official run \`${RUN}\`: A ${ACC.A} (default), B ${ACC.B} (journey savings), L ${ACC.L} (journey loan), S ${ACC.S} / T ${ACC.T} (TRF suite).`,
  '',
  `**${checks.filter((c) => c.result === 'MATCH').length} of ${checks.length} checks match; UI/API mismatches: ${mismatches.length}.** Results: MATCH, MISMATCH (UI and API disagree), RULE NOT MET (both agree, but a proposed rule fails).`,
  '',
  '| Area | Check | Result | Detail |', '|---|---|---|---|',
  ...checks.map((c) => `| ${c.area} | ${c.label} | **${c.result}** | ${String(c.detail).replace(/\|/g, '\\|')} |`),
  '',
  '## What the UI shows',
  '',
  ...Object.entries(ACC).flatMap(([name, id]) => [
    `**${name} — account ${id}** · ${ui[name].type} · balance ${ui[name].balance} · available ${ui[name].available}`,
    '',
    ...(ui[name].rows.length ? ['| Date | Transaction | Debit | Credit | Id |', '|---|---|---|---|---|', ...ui[name].rows.map((r) => `| ${r.date} | ${r.description} | ${r.debit} | ${r.credit} | ${r.id} |`)] : ['*No transactions shown.*']),
    '',
    `Screenshot: \`activity-${name}-${id}.png\``,
    '',
  ]),
  'Overview screenshot: `overview.png`.',
  '',
];
writeFileSync(join(OUT, 'crosscheck.md'), redact(md.join('\n')));
writeFileSync(join(OUT, 'crosscheck.json'), redact(JSON.stringify({ at, customerId, accounts: ACC, checks, overview, ui, api: { accounts: apiAccounts, transactions: apiTrx } }, null, 2)));
console.log(`${checks.filter((c) => c.result === "MATCH").length}/${checks.length} match, UI/API mismatches: ${mismatches.length}`);
for (const c of checks) console.log(`${c.result.padEnd(8)} ${c.area} | ${c.label} | ${c.detail}`);
