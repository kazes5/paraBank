// Defect reproduction (plan.md Stage 4): reproduce every known failure on fresh data, with a passing
// control input next to each failing one, and build one evidence bundle per defect.
//
// - Runs on throwaway users registered by this script (fresh data, no history), never on the .env users.
//   User R: all reproductions; the sub-cent transfer runs last because it breaks the customer.
//   User L: loan-approval experiment (does approval depend on the customer's total balance?).
// - Every call records method, redacted URL, body, status, response, time and balances before/after.
// - Each bundle also gets the matching FAILED records from the latest kept API run.
//
// Output: results/runs/<runId>-repro/BUG-0NN/{repro.md, repro.json, stage3-failures.json}
//         --publish also copies the bundles to evidence/bugs/ (the frozen evidence cited by Bug_Reports.md)
// Usage:  ./run.sh repro [--publish]

import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { API, cents, redact, http as raw, registerThrowaway, newRun, findRun, rebuildIndex } from './lib/common.mjs';
import { CASES, writeAll as writeStage3Failures } from './lib/failures.mjs';

// Options and run folder. --publish also copies the bundles to evidence/bugs/ (the frozen evidence).
const api = API;
const publish = process.argv.includes('--publish');
const runFolder = newRun('repro', { scope: 'all defects' + (publish ? ' (published)' : '') });
const OUT = runFolder.dir;
const register = () => registerThrowaway('qa_s4');

// Balances of the given accounts right now (recorded before and after every step).
async function balances(ids) {
  const out = {};
  for (const id of ids) {
    const r = await raw('GET', `/accounts/${id}`);
    out[id] = r.status === 200 ? r.json.balance : `HTTP ${r.status}`;
  }
  return out;
}

// Opens a new CHECKING account for a throwaway user (from its first account by default).
const openAccount = async (u, from = u.A) =>
  (await raw('POST', '/createAccount', { query: { customerId: u.customerId, newAccountType: 0, fromAccountId: from } }))
    .json.id;

// ---------------------------------------------------------------- bundles

// One evidence bundle per defect. bug(id) starts a bundle; following step() calls are added to it.
const bundles = {};
let current;
function bug(id) {
  current = bundles[id] ??= { id, steps: [] };
}

// One reproduction step: balances before -> call -> balances after
// One recorded call: kind = fail (the defect step), control (the same call done correctly, must work)
// or state (a read that shows the effect). Records request, response and balances before / after, redacted.
async function step(label, kind, method, path, { query, body, accounts = [], expect } = {}) {
  const before = accounts.length ? await balances(accounts) : undefined;
  const r = await raw(method, path, { query, body });
  const after = accounts.length ? await balances(accounts) : undefined;
  const rec = {
    label,
    kind,
    at: new Date().toISOString(),
    method,
    url: redact(r.url),
    requestBody: body === undefined ? undefined : redact(typeof body === 'string' ? body : JSON.stringify(body)),
    status: r.status,
    ms: r.ms,
    response: redact(r.text).slice(0, 1500),
    before,
    after,
    expect,
  };
  current.steps.push(rec);
  const delta = before
    ? ' | ' +
      Object.keys(before)
        .map((k) => `${k}: ${before[k]} → ${after[k]}`)
        .join('; ')
    : '';
  console.log(`${current.id} ${kind.padEnd(7)} ${r.status} ${method} ${redact(r.url).replace(api, '')}${delta}`);
  return r;
}

// ---------------------------------------------------------------- reproductions (user R)

// Main reproductions run on one fresh user R with accounts S and T.
const R = await register();
console.log(`User R: ${R.username} customer ${R.customerId}, account A ${R.A}`);
const S = await openAccount(R);
const T = await openAccount(R);
console.log(`Fresh accounts S ${S}, T ${T}`);
const payee = {
  name: 'City Utilities',
  address: { street: '1 Main St', city: 'Springfield', state: 'IL', zipCode: '62701' },
  phoneNumber: '5550100',
  accountNumber: T,
};

// Each block below reproduces one defect: usually a control step, then the failing call, then a read of the effect.
bug('BUG-002'); // no authentication
await step('Profile of the customer, no cookie or credentials', 'fail', 'GET', `/customers/${R.customerId}`, {
  expect: '401/403, no data',
});
await step('Account of the customer, no cookie or credentials', 'fail', 'GET', `/accounts/${S}`, {
  expect: '401/403, no data',
});
await step('Transfer 1.00 S → T with no cookie or credentials', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T, amount: 1 },
  accounts: [S, T],
  expect: '401/403, nothing moves',
});

bug('BUG-008'); // password in URL
await step(
  'Login with a wrong password: the server parses the password from the URL path',
  'fail',
  'GET',
  `/login/${R.username}/NotMyRealPassword-123`,
  { expect: 'credentials not in the URL (POST body or header)' },
);

bug('BUG-003'); // negative amounts
await step('Control: transfer 1.00 S → T', 'control', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T, amount: 1 },
  accounts: [S, T],
  expect: 'S −1, T +1',
});
await step('Transfer −1.00 S → T', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T, amount: -1 },
  accounts: [S, T],
  expect: '4xx, nothing moves',
});
await step('Deposit −5.00 into S', 'fail', 'POST', '/deposit', {
  query: { accountId: S, amount: -5 },
  accounts: [S],
  expect: '4xx, nothing moves',
});
await step('Withdraw −5.00 from S', 'fail', 'POST', '/withdraw', {
  query: { accountId: S, amount: -5 },
  accounts: [S],
  expect: '4xx, nothing moves',
});
await step('Bill pay −5.00 from S', 'fail', 'POST', '/billpay', {
  query: { accountId: S, amount: -5 },
  body: payee,
  accounts: [S, T],
  expect: '4xx, nothing moves',
});

bug('BUG-010'); // zero amounts
await step('Transfer 0.00 S → T', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T, amount: 0 },
  accounts: [S, T],
  expect: '4xx, no transaction',
});
await step('Deposit 0.00 into S', 'fail', 'POST', '/deposit', {
  query: { accountId: S, amount: 0 },
  accounts: [S],
  expect: '4xx, no transaction',
});
await step('Withdraw 0.00 from S', 'fail', 'POST', '/withdraw', {
  query: { accountId: S, amount: 0 },
  accounts: [S],
  expect: '4xx, no transaction',
});
await step('Transactions of S: 0.00 rows recorded?', 'state', 'GET', `/accounts/${S}/transactions/amount/0`, {
  expect: 'no 0.00 rows',
});

bug('BUG-011'); // same account
await step('Transfer 1.00 S → S', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: S, amount: 1 },
  accounts: [S],
  expect: '4xx',
});
await step('Transactions of S with amount 1.00', 'state', 'GET', `/accounts/${S}/transactions/amount/1`, {
  expect: 'no rows from the S → S transfer',
});

bug('BUG-007'); // empty payee
await step('Control: bill pay 1.00 with full payee', 'control', 'POST', '/billpay', {
  query: { accountId: S, amount: 1 },
  body: payee,
  accounts: [S],
  expect: 'S −1, BillPayResult',
});
await step('Bill pay 1.00 with empty payee {}', 'fail', 'POST', '/billpay', {
  query: { accountId: S, amount: 1 },
  body: '{}',
  accounts: [S],
  expect: '4xx, no money taken',
});
await step('Transactions of S with amount 1.00', 'state', 'GET', `/accounts/${S}/transactions/amount/1`, {
  expect: 'no "Bill Payment to null" row',
});

bug('BUG-012'); // transfer bad amount -> 500
await step('Control: transfer 1.00 S → T', 'control', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T, amount: 1 },
  accounts: [S, T],
  expect: '200',
});
await step('Transfer without amount', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T },
  accounts: [S, T],
  expect: '400 with a message',
});
await step('Transfer with amount "abc"', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: S, toAccountId: T, amount: 'abc' },
  accounts: [S, T],
  expect: '400 with a message',
});

bug('BUG-013'); // type filter case -> 500
const month = new Date().toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
await step(
  'Control: month filter with type Credit',
  'control',
  'GET',
  `/accounts/${S}/transactions/month/${month}/type/Credit`,
  { expect: '200, list' },
);
await step('Month filter with type CREDIT', 'fail', 'GET', `/accounts/${S}/transactions/month/${month}/type/CREDIT`, {
  expect: '400 with a message',
});
await step('Month filter with type foo', 'fail', 'GET', `/accounts/${S}/transactions/month/${month}/type/foo`, {
  expect: '400 with a message',
});

bug('BUG-014'); // date format silently ignored
const d = new Date();
const p2 = (x) => String(x).padStart(2, '0');
await step(
  'Control: onDate in MM-dd-yyyy',
  'control',
  'GET',
  `/accounts/${S}/transactions/onDate/${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}-${d.getUTCFullYear()}`,
  { expect: "today's rows" },
);
await step(
  'onDate in ISO yyyy-MM-dd',
  'fail',
  'GET',
  `/accounts/${S}/transactions/onDate/${d.toISOString().slice(0, 10)}`,
  { expect: '400 with a message (or the same rows)' },
);

bug('BUG-015'); // date fields are numbers
await step('Transaction list: type of the date field', 'fail', 'GET', `/accounts/${S}/transactions`, {
  expect: 'Transaction.date as date-time string (Swagger)',
});

bug('BUG-009'); // createAccount response balance
const created = await step('Open a new CHECKING account from A', 'fail', 'POST', '/createAccount', {
  query: { customerId: R.customerId, newAccountType: 0, fromAccountId: R.A },
  accounts: [R.A],
  expect: 'response balance = real balance',
});
await step('Read the new account', 'state', 'GET', `/accounts/${created.json?.id}`, {
  expect: 'same balance as the create response',
});

bug('BUG-004'); // overdraft
const exact = cents((await raw('GET', `/accounts/${T}`)).json.balance) / 100;
await step('Control: transfer the exact balance of T to S', 'control', 'POST', '/transfer', {
  query: { fromAccountId: T, toAccountId: S, amount: exact.toFixed(2) },
  accounts: [T, S],
  expect: 'T = 0.00',
});
await step('Transfer 0.01 more than T holds (T = 0.00)', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: T, toAccountId: S, amount: '0.01' },
  accounts: [T, S],
  expect: '4xx, nothing moves',
});
await step('Withdraw 1000.00 from T', 'fail', 'POST', '/withdraw', {
  query: { accountId: T, amount: 1000 },
  accounts: [T],
  expect: '4xx, nothing moves',
});
await step('Bill pay 1000.00 from T', 'fail', 'POST', '/billpay', {
  query: { accountId: T, amount: 1000 },
  body: { ...payee, accountNumber: S },
  accounts: [T],
  expect: '4xx, nothing moves',
});

// Bring the customer total back above zero before the loan steps (approval looks at the total, see BUG-005 / S-loan)
await raw('POST', '/deposit', { query: { accountId: T, amount: 2000 } });

bug('BUG-006'); // loan not recorded
const L1 = await step('Request loan 500, down payment 50, from S', 'fail', 'POST', '/requestLoan', {
  query: { customerId: R.customerId, amount: 500, downPayment: 50, fromAccountId: S },
  accounts: [S],
  expect: 'LoanResponse; loan and down payment recorded',
});
if (L1.json?.approved) {
  await step('Loan account', 'state', 'GET', `/accounts/${L1.json.accountId}`, { expect: 'LOAN account' });
  await step('Transactions of the loan account', 'fail', 'GET', `/accounts/${L1.json.accountId}/transactions`, {
    expect: 'at least one entry recording the loan',
  });
  await step('Transactions of S with amount 50.00', 'control', 'GET', `/accounts/${S}/transactions/amount/50`, {
    expect: 'down payment Debit 50.00',
  });
  bug('BUG-015');
  current.steps.push({
    ...bundles['BUG-006'].steps.find((s) => s.method === 'POST'),
    label: 'LoanResponse.responseDate type (same call as BUG-006)',
    kind: 'fail',
    expect: 'responseDate as date-time string (Swagger)',
  });
}

bug('BUG-005'); // loan down payment above the account balance
const sBal = cents((await raw('GET', `/accounts/${S}`)).json.balance) / 100;
await step(
  `Request loan 1000 with down payment ${(sBal + 100).toFixed(2)} (S holds ${sBal.toFixed(2)})`,
  'fail',
  'POST',
  '/requestLoan',
  {
    query: { customerId: R.customerId, amount: 1000, downPayment: (sBal + 100).toFixed(2), fromAccountId: S },
    accounts: [S],
    expect: 'denied, nothing changes',
  },
);

bug('BUG-017'); // selling more shares than the position holds
// Account A still holds money; S may be overdrawn by now. Control first: a normal buy and a normal sell.
const bought = await step(
  'Control: buy 2 shares × 10.00 from A',
  'control',
  'POST',
  `/customers/${R.customerId}/buyPosition`,
  {
    query: { accountId: R.A, name: 'QA Test Stock', symbol: 'QATS', shares: 2, pricePerShare: 10 },
    accounts: [R.A],
    expect: 'A − 20.00, position with 2 shares',
  },
);
const pos = (Array.isArray(bought.json) ? bought.json : []).find((x) => x.symbol === 'QATS');
if (pos) {
  await step('Control: sell 1 share × 12.00 to A', 'control', 'POST', `/customers/${R.customerId}/sellPosition`, {
    query: { accountId: R.A, positionId: pos.positionId, shares: 1, pricePerShare: 12 },
    accounts: [R.A],
    expect: 'A + 12.00, position with 1 share',
  });
  await step(
    'Sell 100 shares × 10.00 (the position holds 1)',
    'fail',
    'POST',
    `/customers/${R.customerId}/sellPosition`,
    {
      query: { accountId: R.A, positionId: pos.positionId, shares: 100, pricePerShare: 10 },
      accounts: [R.A],
      expect: '4xx, nothing changes (cannot sell shares not owned)',
    },
  );
  await step('Position after the oversell', 'state', 'GET', `/positions/${pos.positionId}`, {
    expect: 'still 1 share',
  });
}

// ---------------------------------------------------------------- loan approval experiment (user L)

const Lu = await register();
console.log(`User L: ${Lu.username} customer ${Lu.customerId}, account A ${Lu.A}`);
const LS = await openAccount(Lu);
bug('S-LOAN');
await step(
  'Customer total positive (A + S, each with its opening balance): loan 100, down 50 from S',
  'control',
  'POST',
  '/requestLoan',
  {
    query: { customerId: Lu.customerId, amount: 100, downPayment: 50, fromAccountId: LS },
    accounts: [Lu.A, LS],
    expect: 'approved',
  },
);
await step(
  'Overdraw A by withdrawing 1000.00 (customer total becomes negative; S untouched)',
  'state',
  'POST',
  '/withdraw',
  { query: { accountId: Lu.A, amount: 1000 }, accounts: [Lu.A, LS] },
);
await step('Same loan again from S (S still holds 50.00 ≥ down payment 10)', 'fail', 'POST', '/requestLoan', {
  query: { customerId: Lu.customerId, amount: 100, downPayment: 10, fromAccountId: LS },
  accounts: [Lu.A, LS],
  expect: 'decision based on S, or a message naming the real reason',
});
await step('Deposit 2000.00 into A (customer total positive again)', 'state', 'POST', '/deposit', {
  query: { accountId: Lu.A, amount: 2000 },
  accounts: [Lu.A, LS],
});
await step('Same loan again from S', 'control', 'POST', '/requestLoan', {
  query: { customerId: Lu.customerId, amount: 100, downPayment: 10, fromAccountId: LS },
  accounts: [Lu.A, LS],
  expect: 'approved',
});

// ---------------------------------------------------------------- sub-cent (last: breaks user R)

bug('BUG-001');
const X = await openAccount(R);
const Y = await openAccount(R);
await step('Control: transfer 0.01 X → Y', 'control', 'POST', '/transfer', {
  query: { fromAccountId: X, toAccountId: Y, amount: '0.01' },
  accounts: [X, Y],
  expect: 'X −0.01, Y +0.01',
});
await step('Transfer 0.005 X → Y', 'fail', 'POST', '/transfer', {
  query: { fromAccountId: X, toAccountId: Y, amount: '0.005' },
  accounts: [X, Y],
  expect: '4xx (or rounded), accounts stay readable',
});
await step('Customer account list after the 0.005 transfer', 'fail', 'GET', `/customers/${R.customerId}/accounts`, {
  expect: '200',
});

// ---------------------------------------------------------------- write bundles

// Write each bundle: repro.json (every step) and repro.md (a table of steps with the request and the result),
// plus the matching FAILED records from the latest kept API run.
const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
const apiRun = findRun('latest', { kind: 'api', keptOnly: true });
const stage3Counts = writeStage3Failures(OUT, apiRun.dir);
for (const b of Object.values(bundles)) {
  const dir = join(OUT, b.id);
  mkdirSync(dir, { recursive: true });
  const stage3Count = stage3Counts[b.id] || 0;
  writeFileSync(
    join(dir, 'repro.json'),
    `${redact(JSON.stringify({ users: { R: R.username, L: Lu.username }, steps: b.steps }, null, 2))}\n`,
  );
  writeFileSync(
    join(dir, 'repro.md'),
    redact(
      [
        `# ${b.id} — reproduction on fresh data`,
        '',
        `Throwaway user${b.id === 'S-LOAN' ? ` ${Lu.username} (customer ${Lu.customerId})` : ` ${R.username} (customer ${R.customerId})`}, run ${b.steps[0]?.at ?? ''}. Requests paced 1.5 s; balances read with \`GET /accounts/{id}\` before and after each call.`,
        `Related Stage 3 cases: ${(CASES[b.id] || []).join(', ') || '—'}${stage3Count ? ` (${stage3Count} FAILED records in \`stage3-failures.json\`)` : ''}.`,
        '',
        '| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |',
        '|---|---|---|---|---|---|---|---|',
        ...b.steps.map(
          (s, i) =>
            `| ${i + 1} | ${s.kind} | ${cell(s.label)} | \`${s.method} ${cell(s.url.replace(api, ''))}\`${s.requestBody ? ` body \`${cell(s.requestBody)}\`` : ''} | ${s.status} | ${cell(s.response)} | ${
              s.before
                ? cell(
                    Object.keys(s.before)
                      .map((k) => `${k}: ${s.before[k]} → ${s.after[k]}`)
                      .join('; '),
                  )
                : '—'
            } | ${cell(s.expect)} |`,
        ),
        '',
        '*Kind:* control = valid input that should work · fail = the input under test · state = read-back.',
        '',
      ].join('\n'),
    ),
  );
}
// Run summary: which defects reproduced (their fail step behaved wrongly) and which did not.
const reproduced = Object.values(bundles).filter(
  (b) => b.id.startsWith('BUG') && b.steps.some((s) => s.kind === 'fail'),
).length;
runFolder.update({
  finished: new Date().toISOString(),
  users: {
    R: { username: R.username, customerId: R.customerId },
    L: { username: Lu.username, customerId: Lu.customerId },
  },
  apiRun: apiRun.id,
  bundles: Object.keys(bundles).sort(),
  counts: { bundles: Object.keys(bundles).length },
});
writeFileSync(
  join(OUT, 'summary.md'),
  [
    `# Defect reproduction — run ${runFolder.id}`,
    '',
    `Throwaway users: R \`${R.username}\` (customer ${R.customerId}), L \`${Lu.username}\` (customer ${Lu.customerId}). Stage 3 failure records from \`${apiRun.id}\`.`,
    '',
    '| Bundle | Steps | Failing inputs | Statuses of failing inputs |',
    '|---|---|---|---|',
    ...Object.values(bundles)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((b) => {
        const f = b.steps.filter((s) => s.kind === 'fail');
        return `| [${b.id}](${b.id}/repro.md) | ${b.steps.length} | ${f.length} | ${f.map((s) => s.status).join(', ')} |`;
      }),
    '',
    `${reproduced} defect bundles with failing inputs. Compare with Bug_Reports.md: a status or balance that differs from the report means the behavior changed.`,
    '',
  ].join('\n'),
);
// Site trouble (rate limit, gateway errors, e.g. during a site reset) makes the run BLOCKED: its
// responses describe the site, not ParaBank, so nothing is published (exit 3). A plain 500 is a result.
const siteTrouble = Object.values(bundles)
  .flatMap((b) => b.steps)
  .filter(
    (st) => st.status === 429 || (st.status >= 502 && st.status <= 504) || (st.status >= 520 && st.status <= 530),
  );
if (publish && !siteTrouble.length)
  for (const b of Object.keys(bundles)) cpSync(join(OUT, b), join('evidence', 'bugs', b), { recursive: true });
rebuildIndex();
if (siteTrouble.length) {
  console.error(
    `BLOCKED: ${siteTrouble.length} response(s) were rate limits or gateway errors (${[...new Set(siteTrouble.map((st) => st.status))].join(', ')}); the site was unavailable${publish ? ', so nothing was published' : ''}. Re-run after ./run.sh setup.`,
  );
  process.exit(3);
}
console.log(
  `\nBundles: ${Object.keys(bundles).sort().join(' ')}${publish ? ' (published to evidence/bugs/)' : ''}\nRun: ${OUT}`,
);
