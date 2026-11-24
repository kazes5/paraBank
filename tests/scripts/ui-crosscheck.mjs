// Web UI cross-check (plan.md §3.3 step 4): J09, J10, J13 and TRF-01 of an API run, seen in the web UI.
//
// Logs in through the web UI with local Chrome (Playwright, channel "chrome"), reads the
// Accounts Overview and each account's Activity page, and compares them with the REST API
// at the same moment: balances, account types, and every transaction (type, amount, description).
// Then checks that the specific operations of that API run are visible in the UI.
// Account IDs come from the API run's run.json (recorded by the journey and the TRF fixtures).
//
// Output: results/runs/<runId>-ui/ (summary.md, results.json, screenshots/)
// Usage:  ./run.sh ui [apiRunId|latest] [--user PARABANK2]

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE,
  readUser,
  redact,
  http,
  newRun,
  findRun,
  allRuns,
  rebuildIndex,
  maskedScreenshot,
} from './lib/common.mjs';

// Arguments: an API run ID (default: the latest API run) and a .env user prefix (default PARABANK).
const args = process.argv.slice(2);
const prefix = args.find((a) => /^[A-Z0-9_]+$/.test(a) && a.startsWith('PARABANK')) || 'PARABANK';
const ref = args.find((a) => !a.startsWith('PARABANK')) || 'latest';
// "latest" = the latest API run with a journey and the TRF suite: a load session's smoke gate is an API
// run too, but has no accounts to compare.
const apiRun =
  ref === 'latest'
    ? allRuns()
        .filter((r) => r.kind === 'api' && r.accounts?.A && r.accounts?.S)
        .at(-1) || findRun('latest', { kind: 'api' })
    : findRun(ref, { kind: 'api' });
const user = readUser(prefix);
const e = (k) => ({ USERNAME: user.username, PASSWORD: user.password })[k];
const web = BASE;
const RUN = apiRun.dir;
// Accounts to compare: the IDs the API run recorded (journey A, B, L and TRF fixture S, T).
// Without them there is nothing to cross-check, so stop (exit 2).
const ACC = Object.fromEntries(
  Object.entries(apiRun.accounts || {}).filter(([k, v]) => ['A', 'B', 'L', 'S', 'T'].includes(k) && v),
);
if (!ACC.A || !ACC.S) {
  console.error(`Run ${apiRun.id} has no recorded account IDs (needs a journey and the TRF suite, i.e. ./run.sh all).`);
  process.exit(2);
}
// This run's folder; screenshots go to screenshots/.
const run = newRun('ui', {
  user: user.username,
  scope: `cross-check of ${apiRun.id}`,
  apiRun: apiRun.id,
  accounts: ACC,
});
const OUT = run.sub('screenshots');

// Transactions the API run created, each of which must also appear on the web UI's Activity page.
const EXPECT = [
  { step: 'J09', what: 'transfer 50.00 B → A', account: 'B', type: 'Debit', cents: 5000, desc: /Funds Transfer Sent/ },
  {
    step: 'J09',
    what: 'transfer 50.00 B → A',
    account: 'A',
    type: 'Credit',
    cents: 5000,
    desc: /Funds Transfer Received/,
  },
  {
    step: 'J10',
    what: 'bill payment 30.00 from A to City Utilities',
    account: 'A',
    type: 'Debit',
    cents: 3000,
    desc: /Bill Payment to City Utilities/,
  },
  {
    step: 'J13',
    what: 'loan down payment 50.00 from A',
    account: 'A',
    type: 'Debit',
    cents: 5000,
    desc: /Down Payment/i,
  },
  { step: 'TRF-01', what: 'transfer 1.00 S → T', account: 'S', type: 'Debit', cents: 100, desc: /Funds Transfer Sent/ },
  {
    step: 'TRF-01',
    what: 'transfer 1.00 S → T',
    account: 'T',
    type: 'Credit',
    cents: 100,
    desc: /Funds Transfer Received/,
  },
];

// UI amount text ("$1,234.50") → integer cents.
const cents = (s) => Math.round(Number(String(s).replace(/[$,\s]/g, '')) * 100);

// Plain API read (paced), used for the API side of the comparison.
async function apiGet(path) {
  const r = await http('GET', path);
  if (r.status !== 200) throw new Error(`API ${path}: HTTP ${r.status}`);
  return r.json;
}

// Headless Chrome; shot(name) saves a full-page screenshot as evidence.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const shot = (name) => maskedScreenshot(page, { path: join(OUT, `${name}.png`), fullPage: true }); // profile masked

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
const overview = await page.$$eval('#accountTable tbody tr', (rows) =>
  rows
    .map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent.trim()))
    .filter((c) => /^\d+$/.test(c[0]))
    .map((c) => ({ id: Number(c[0]), balance: c[1], available: c[2] })),
);
await shot('overview');

// ---- Activity page per account
// Reads one account's Activity page: account details and every transaction row (id, date, description, type, amount).
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
  const rows = await page.$$eval('#transactionTable tbody tr', (trs) =>
    trs
      .map((r) => [...r.querySelectorAll('td')])
      .filter((td) => td.length >= 4)
      .map((td) => ({
        date: td[0].textContent.trim(),
        description: td[1].textContent.trim(),
        id: Number((td[1].querySelector('a')?.getAttribute('href') || '').replace(/.*id=/, '')) || null,
        debit: td[2].textContent.trim(),
        credit: td[3].textContent.trim(),
      })),
  );
  await shot(`activity-${name}-${id}`);
  return {
    ...details,
    rows: rows.map((r) => ({ ...r, type: r.debit ? 'Debit' : 'Credit', cents: cents(r.debit || r.credit) })),
  };
}

const ui = {};
for (const [name, id] of Object.entries(ACC)) ui[name] = await activity(name, id);
await browser.close();

// ---- API at the same moment
const customerId = (await apiGet(`/login/${encodeURIComponent(e('USERNAME'))}/${encodeURIComponent(e('PASSWORD'))}`))
  .id;
const apiAccounts = await apiGet(`/customers/${customerId}/accounts`);
const apiTrx = {};
for (const [name, id] of Object.entries(ACC)) apiTrx[name] = await apiGet(`/accounts/${id}/transactions`);

// ---- compare
// check(area, label, ok, detail): record one comparison as MATCH or MISMATCH.
const checks = [];
const check = (area, label, ok, detail, fail = 'MISMATCH') =>
  checks.push({ area, label, result: ok ? 'MATCH' : fail, detail });
const sig = (r) => `${r.id} ${r.type} ${r.cents}`;

// Overview: same set of accounts, and the same balance for each, in UI and API.
const apiIds = apiAccounts.map((a) => a.id).sort((x, y) => x - y);
const uiIds = overview.map((a) => a.id).sort((x, y) => x - y);
check(
  'Overview',
  'same accounts in UI and API',
  JSON.stringify(uiIds) === JSON.stringify(apiIds),
  `UI ${uiIds.length}, API ${apiIds.length}`,
);
for (const a of apiAccounts) {
  const o = overview.find((x) => x.id === a.id);
  if (o && cents(o.balance) !== Math.round(a.balance * 100))
    check('Overview', `balance of ${a.id}`, false, `UI ${o.balance}, API ${a.balance}`);
}
check(
  'Overview',
  'every balance equal in UI and API',
  !checks.some((c) => c.area === 'Overview' && c.label.startsWith('balance of')),
  `${apiAccounts.length} accounts compared`,
);

for (const [name, id] of Object.entries(ACC)) {
  // Activity page per account: type, balance and transaction list must equal the API's.
  const a = apiAccounts.find((x) => x.id === id);
  const u = ui[name];
  check(
    `Account ${name} (${id})`,
    'type and balance',
    a && u.type === a.type && cents(u.balance) === Math.round(a.balance * 100),
    `UI ${u.type} ${u.balance}, API ${a?.type} ${a?.balance}`,
  );
  const apiSig = apiTrx[name].map((r) => sig({ id: r.id, type: r.type, cents: Math.round(r.amount * 100) })).sort();
  const uiSig = u.rows.map(sig).sort();
  check(
    `Account ${name} (${id})`,
    'same transactions (id, type, amount)',
    JSON.stringify(apiSig) === JSON.stringify(uiSig),
    `UI ${uiSig.length} rows, API ${apiSig.length} rows`,
  );
  const descDiff = apiTrx[name].filter((r) => {
    const x = u.rows.find((y) => y.id === r.id);
    return x && x.description !== r.description;
  });
  check(
    `Account ${name} (${id})`,
    'same descriptions',
    descDiff.length === 0,
    descDiff.length ? JSON.stringify(descDiff.map((r) => r.id)) : `${apiTrx[name].length} compared`,
  );
}

// A and S also hold rows from earlier runs today; transaction ids only grow, so the official run's rows
// are the ones newer than the first row of an account created in that run (B for the journey, S/T for TRF)
const sinceId = { A: Math.min(...ui.B.rows.map((r) => r.id)), B: 0, L: 0, S: 0, T: 0 };
// Each expected transaction from the API run must be visible in the UI (J13 only if the loan was approved).
for (const x of EXPECT.filter((e) => e.step !== 'J13' || ACC.L)) {
  const hit = ui[x.account].rows
    .filter((r) => r.id >= sinceId[x.account] && r.type === x.type && r.cents === x.cents && x.desc.test(r.description))
    .filter((r) => x.step !== 'J13' || r.description.includes(String(ACC.L)))
    .slice(0, 1);
  check(
    x.step,
    `${x.what}: ${x.type} ${(x.cents / 100).toFixed(2)} on ${x.account} visible in UI`,
    hit.length >= 1,
    hit.length ? hit.map((r) => `${r.date} "${r.description}" #${r.id}`).join('; ') : 'not found',
  );
}
if (ACC.L) {
  check(
    'J13',
    'loan account shown as LOAN in UI',
    ui.L.type === 'LOAN',
    `UI type ${ui.L.type}, balance ${ui.L.balance}`,
  );
  check(
    'J13',
    'loan recorded in the loan account history (rule A12)',
    ui.L.rows.length > 0,
    `UI and API agree: ${ui.L.rows.length} rows in UI, ${apiTrx.L.length} in API. Same gap as LOAN-01 / J13e, not a UI-only problem`,
    'RULE NOT MET (A12)',
  );
} else
  check(
    'J13',
    'loan approved in the API run',
    false,
    'loan was denied in that run: J13 not cross-checked',
    'NOT APPLICABLE',
  );

// ---- write
const at = new Date().toISOString();
// Write summary.md (one row per check) and run.json; print every check; exit 1 on any mismatch.
const mismatches = checks.filter((c) => c.result === 'MISMATCH');
const md = [
  `# Web UI cross-check — run ${run.id}`,
  '',
  `Run at ${at} as ${e('USERNAME')} (customer ${customerId}) with local Chrome via Playwright; each UI page was compared with the REST API read seconds later.`,
  `Accounts from API run \`${apiRun.id}\`: A ${ACC.A} (default), B ${ACC.B} (journey savings), L ${ACC.L} (journey loan), S ${ACC.S} / T ${ACC.T} (TRF suite).`,
  '',
  `**${checks.filter((c) => c.result === 'MATCH').length} of ${checks.length} checks match; UI/API mismatches: ${mismatches.length}.** Results: MATCH, MISMATCH (UI and API disagree), RULE NOT MET (both agree, but a proposed rule fails).`,
  '',
  '| Area | Check | Result | Detail |',
  '|---|---|---|---|',
  ...checks.map((c) => `| ${c.area} | ${c.label} | **${c.result}** | ${String(c.detail).replace(/\|/g, '\\|')} |`),
  '',
  '## What the UI shows',
  '',
  ...Object.entries(ACC).flatMap(([name, id]) => [
    `**${name} — account ${id}** · ${ui[name].type} · balance ${ui[name].balance} · available ${ui[name].available}`,
    '',
    ...(ui[name].rows.length
      ? [
          '| Date | Transaction | Debit | Credit | Id |',
          '|---|---|---|---|---|',
          ...ui[name].rows.map((r) => `| ${r.date} | ${r.description} | ${r.debit} | ${r.credit} | ${r.id} |`),
        ]
      : ['*No transactions shown.*']),
    '',
    `Screenshot: \`screenshots/activity-${name}-${id}.png\``,
    '',
  ]),
  'Overview screenshot: `screenshots/overview.png`.',
  '',
];
writeFileSync(join(run.dir, 'summary.md'), redact(md.join('\n')));
const matched = checks.filter((c) => c.result === 'MATCH').length;
run.update({
  finished: new Date().toISOString(),
  counts: { MATCH: matched, MISMATCH: mismatches.length, 'RULE NOT MET': checks.length - matched - mismatches.length },
});
rebuildIndex();
console.log(`Run: ${run.dir}`);
writeFileSync(
  join(run.dir, 'results.json'),
  redact(
    JSON.stringify(
      { at, customerId, accounts: ACC, checks, overview, ui, api: { accounts: apiAccounts, transactions: apiTrx } },
      null,
      2,
    ),
  ),
);
console.log(
  `${checks.filter((c) => c.result === 'MATCH').length}/${checks.length} match, UI/API mismatches: ${mismatches.length}`,
);
for (const c of checks) console.log(`${c.result.padEnd(8)} ${c.area} | ${c.label} | ${c.detail}`);
