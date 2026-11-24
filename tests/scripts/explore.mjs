// Stage 1 exploration (plan.md): walk the customer journey once and probe edge cases,
// recording status, body and balances before/after for every request.
//
// Runs on a fresh THROWAWAY customer by default: some probes are destructive (overdrafts, negative
// amounts, and the 0.005 transfer that makes the accounts unreadable, BUG-001), so they must never
// touch the shared .env test users. Account F is a second account opened from A for the probes.
// Invalid IDs are limited to -1 / 0 / non-numeric; no other customer's data is used.
//
// Output (credentials and SSN redacted):
//   evidence/exploration/observations.json   - every probe, full detail
//   evidence/exploration/observations.md     - one table row per probe
//   evidence/exploration/latency-baseline.md - unloaded response times per endpoint class (O7)
//
// Usage: ./run.sh explore     (node --env-file=.env tests/scripts/explore.mjs)

import { mkdirSync, writeFileSync } from 'node:fs';
import { registerThrowaway, http } from './lib/common.mjs';

// Throwaway customer (profile set by registerThrowaway) with account A, plus a second account F.
const tw = await registerThrowaway('qa_s1');
const user = {
  username: tw.username,
  password: tw.password,
  ssn: tw.ssn,
  firstName: 'QA',
  lastName: 'Throwaway',
  street: '1 Test St',
  city: 'Testville',
  state: 'TS',
  zipCode: '00000',
  phoneNumber: '5550000',
};
const customerId = tw.customerId;
const A = tw.A;
const opened = await http('POST', '/createAccount', { query: { customerId, newAccountType: 0, fromAccountId: A } });
const F = opened.json?.id;
if (!F) {
  console.error(`Could not open account F for the throwaway customer (HTTP ${opened.status})`);
  process.exit(3);
}

// Target API, forbidden admin endpoints, and the secrets to redact from all output.
const api = `${process.env.BASE_URL}/services/bank`;
const FORBIDDEN = /cleanDB|initializeDB|setParameter|JmsListener/i;
const SECRETS = [user.password, user.ssn].filter(Boolean);
// Every encoding a secret can appear in: raw, path-encoded, query/form-encoded (URLSearchParams), JSON-escaped
const encodings = (s) => [
  ...new Set([
    s,
    encodeURIComponent(s),
    new URLSearchParams({ x: s }).toString().slice(2),
    JSON.stringify(s).slice(1, -1),
  ]),
];
const SECRET_FORMS = SECRETS.flatMap(encodings).sort((a, b) => b.length - a.length);
const redact = (s) => SECRET_FORMS.reduce((t, x) => t.split(x).join('<REDACTED>'), String(s));

// ParaBank sits behind Cloudflare, which rate-limits bursts (HTTP 429, error 1015). Pace every request.
const PACE_MS = Number(process.env.PACE_MS || 1500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const observations = [];
// START_AT=<probe id> skips every probe before it (to resume after an interrupted run without repeating writes)
let started = !process.env.START_AT;

// One paced, unrecorded call (refuses admin endpoints, stops on HTTP 429); returns status, text and JSON.
async function raw(method, path, { query, body, accept = 'application/json' } = {}) {
  const url = new URL(api + path);
  if (FORBIDDEN.test(url.pathname)) throw new Error(`Forbidden endpoint: ${url.pathname}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  const headers = { Accept: accept };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  await sleep(PACE_MS);
  const t0 = performance.now();
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  if (res.status === 429)
    throw new Error(
      `Rate limited (HTTP 429) at ${method} ${redact(url.pathname)}; stopping so results stay valid. Wait and re-run.`,
    );
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain text or XML */
  }
  return { url: url.toString(), status: res.status, contentType: res.headers.get('content-type'), ms, text, json };
}

// Balances of the given accounts right now, in cents.
async function balances(ids) {
  const out = {};
  for (const id of ids) {
    const r = await raw('GET', `/accounts/${id}`);
    out[id] = r.json?.balance ?? `HTTP ${r.status}`;
  }
  return out;
}

// One recorded probe. `accounts` = account IDs whose balances are snapshotted before and after.
async function probe(id, purpose, method, path, opts = {}) {
  if (!started && id === process.env.START_AT) started = true;
  if (!started) return { status: 0, json: undefined, text: '' };
  const accounts = opts.accounts || [];
  const before = accounts.length ? await balances(accounts) : undefined;
  const r = await raw(method, path, opts);
  const after = accounts.length ? await balances(accounts) : undefined;
  const o = {
    id,
    purpose,
    method,
    url: redact(r.url),
    requestBody: opts.body,
    accept: opts.accept || 'application/json',
    status: r.status,
    contentType: r.contentType,
    ms: r.ms,
    body: redact(r.text).slice(0, 2000),
    before,
    after,
    at: new Date().toISOString(),
  };
  observations.push(o);
  const delta = before ? ' ' + accounts.map((a) => `${a}:${before[a]}→${after[a]}`).join(' ') : '';
  console.log(
    `${id.padEnd(8)} ${r.status} ${method} ${redact(r.url).replace(api, '')}${delta}\n         ${o.body.replace(/\s+/g, ' ').slice(0, 160)}`,
  );
  return r;
}

// Today's date in the forms the transaction filters accept, and a bill-pay payee builder.
const today = new Date();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const yyyy = today.getFullYear();
const monthName = today.toLocaleString('en-US', { month: 'long' });
const payee = (overrides = {}) => ({
  name: 'City Utilities',
  address: { street: '1 Main St', city: 'Springfield', state: 'IL', zipCode: '62701' },
  phoneNumber: '5551234567',
  accountNumber: F,
  ...overrides,
});

// ---------------- Journey walk (J02-J17) on account A ----------------
console.log(`\n=== Journey walk: user ${user.username}, customer ${customerId}, A=${A}\n`);
const login = (u, p, accept) =>
  probe('J02', 'login with valid credentials', 'GET', `/login/${encodeURIComponent(u)}/${encodeURIComponent(p)}`, {
    accept,
  });
await login(user.username, user.password);
await probe('J03', 'get customer', 'GET', `/customers/${customerId}`);
await probe('J04', 'list accounts', 'GET', `/customers/${customerId}/accounts`);
await probe('J05', 'get account A', 'GET', `/accounts/${A}`);
const created = await probe('J06', 'open SAVINGS account funded from A (newAccountType=1)', 'POST', '/createAccount', {
  query: { customerId, newAccountType: 1, fromAccountId: A },
  accounts: [A],
});
const B = created.json?.id;
if (B) await probe('J06b', 'read new account B right after creation', 'GET', `/accounts/${B}`);
await probe('J07', 'deposit 200 to B', 'POST', '/deposit', { query: { accountId: B, amount: 200 }, accounts: [B] });
await probe('J08', 'withdraw 20 from B', 'POST', '/withdraw', { query: { accountId: B, amount: 20 }, accounts: [B] });
await probe('J09', 'transfer 50 B -> A', 'POST', '/transfer', {
  query: { fromAccountId: B, toAccountId: A, amount: 50 },
  accounts: [A, B],
});
await probe('J10', 'billpay 30 from A to payee whose accountNumber = F', 'POST', '/billpay', {
  query: { accountId: A, amount: 30 },
  body: payee(),
  accounts: [A, F],
});
const trxA = await probe('J11a', 'transactions on A', 'GET', `/accounts/${A}/transactions`);
await probe('J11b', 'transactions on B', 'GET', `/accounts/${B}/transactions`);
const someTrx = Array.isArray(trxA.json) ? trxA.json.at(-1) : undefined;
if (someTrx) await probe('J11c', 'single transaction by id (last on A)', 'GET', `/transactions/${someTrx.id}`);
await probe('J12a', 'filter A by amount 50', 'GET', `/accounts/${A}/transactions/amount/50`);
await probe('J12b', 'filter A onDate MM-dd-yyyy', 'GET', `/accounts/${A}/transactions/onDate/${mm}-${dd}-${yyyy}`);
await probe('J12c', 'filter A onDate yyyy-MM-dd', 'GET', `/accounts/${A}/transactions/onDate/${yyyy}-${mm}-${dd}`);
await probe(
  'J12d',
  'filter A fromDate/toDate MM-dd-yyyy',
  'GET',
  `/accounts/${A}/transactions/fromDate/${mm}-${dd}-${yyyy}/toDate/${mm}-${dd}-${yyyy}`,
);
await probe(
  'J12e',
  'filter A fromDate/toDate yyyy-MM-dd',
  'GET',
  `/accounts/${A}/transactions/fromDate/${yyyy}-${mm}-${dd}/toDate/${yyyy}-${mm}-${dd}`,
);
await probe(
  'J12f',
  'filter A month name / type Credit',
  'GET',
  `/accounts/${A}/transactions/month/${monthName}/type/Credit`,
);
await probe(
  'J12g',
  'filter A month name / type CREDIT',
  'GET',
  `/accounts/${A}/transactions/month/${monthName}/type/CREDIT`,
);
await probe('J12h', 'filter A month number / type All', 'GET', `/accounts/${A}/transactions/month/${mm}/type/All`);
await probe('J12i', 'filter A month All / type Debit', 'GET', `/accounts/${A}/transactions/month/All/type/Debit`);
const accsBeforeLoan = await raw('GET', `/customers/${customerId}/accounts`);
await probe('J13', 'request loan 500, down payment 50, from A', 'POST', '/requestLoan', {
  query: { customerId, amount: 500, downPayment: 50, fromAccountId: A },
  accounts: [A],
});
await probe('J13b', 'accounts after loan', 'GET', `/customers/${customerId}/accounts`);
const bought = await probe('J14', 'buy 2 shares x 10.00 from A', 'POST', `/customers/${customerId}/buyPosition`, {
  query: { accountId: A, name: 'QA Test Stock', symbol: 'QATS', shares: 2, pricePerShare: 10 },
  accounts: [A],
});
await probe('J14b', 'list positions', 'GET', `/customers/${customerId}/positions`);
const position = Array.isArray(bought.json) ? bought.json.find((p) => p.symbol === 'QATS') : undefined;
if (position) {
  await probe('J14c', 'get position by id', 'GET', `/positions/${position.positionId}`);
  await probe('J15', 'sell 1 share x 12.00 to A', 'POST', `/customers/${customerId}/sellPosition`, {
    query: { accountId: A, positionId: position.positionId, shares: 1, pricePerShare: 12 },
    accounts: [A],
  });
  await probe('J15b', 'get position after sell', 'GET', `/positions/${position.positionId}`);
}
const updated = { ...user, street: '99 New Street', phoneNumber: '1112223333' };
await probe('J16', 'update profile: new street + phone', 'POST', `/customers/update/${customerId}`, { query: updated });
await probe('J16b', 'customer after update', 'GET', `/customers/${customerId}`);
await probe(
  'J16c',
  'login after update',
  'GET',
  `/login/${encodeURIComponent(user.username)}/${encodeURIComponent(user.password)}`,
);
await probe('J16d', 'restore original profile', 'POST', `/customers/update/${customerId}`, { query: user });
await probe('J17', 'final accounts list', 'GET', `/customers/${customerId}/accounts`);

// ---------------- Edge-case probes (fallback account F and A) ----------------
console.log(`\n=== Edge probes (F=${F}, A=${A})\n`);
const positionForEdge =
  position || (await raw('GET', `/customers/${customerId}/positions`)).json?.find?.((p) => p.symbol === 'QATS');
await probe('E-AUTH1', 'wrong password', 'GET', `/login/${encodeURIComponent(user.username)}/wrong_${Date.now()}`);
await probe('E-AUTH2', 'unknown user', 'GET', `/login/nouser_${Date.now()}/whatever`);
await probe('E-AUTH3', 'injection-style username', 'GET', `/login/${encodeURIComponent("' OR '1'='1")}/x`);
await probe(
  'E-AUTH4',
  'login with XML Accept',
  'GET',
  `/login/${encodeURIComponent(user.username)}/${encodeURIComponent(user.password)}`,
  { accept: 'application/xml' },
);
await probe('E-AUTH5', 'read own customer with no session/credentials', 'GET', `/customers/${customerId}`);
await probe('E-ID1', 'customer -1', 'GET', '/customers/-1');
await probe('E-ID2', 'account -1', 'GET', '/accounts/-1');
await probe('E-ID3', 'account 0', 'GET', '/accounts/0');
await probe('E-ID4', 'account non-numeric', 'GET', '/accounts/abc');
await probe('E-ID5', 'transaction -1', 'GET', '/transactions/-1');
await probe('E-ID6', 'transactions of account -1', 'GET', '/accounts/-1/transactions');
await probe('E-TRF1', 'transfer 0', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: A, amount: 0 },
  accounts: [F, A],
});
await probe('E-TRF2', 'transfer -1', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: A, amount: -1 },
  accounts: [F, A],
});
await probe('E-TRF3', 'transfer > balance (100000)', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: A, amount: 100000 },
  accounts: [F, A],
});
await probe('E-TRF4', 'transfer to same account', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: F, amount: 1 },
  accounts: [F],
});
await probe('E-TRF5', 'transfer to non-existent account -1', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: -1, amount: 1 },
  accounts: [F],
});
await probe('E-TRF6', 'transfer missing amount', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: A },
  accounts: [F, A],
});
await probe('E-TRF8', 'transfer non-numeric amount', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: A, amount: 'abc' },
  accounts: [F, A],
});
await probe('E-DEP1', 'deposit 0', 'POST', '/deposit', { query: { accountId: F, amount: 0 }, accounts: [F] });
await probe('E-DEP2', 'deposit -5', 'POST', '/deposit', { query: { accountId: F, amount: -5 }, accounts: [F] });
await probe('E-DEP3', 'deposit to account -1', 'POST', '/deposit', { query: { accountId: -1, amount: 1 } });
await probe('E-WDR1', 'withdraw > balance (100000)', 'POST', '/withdraw', {
  query: { accountId: F, amount: 100000 },
  accounts: [F],
});
await probe('E-WDR2', 'withdraw -5', 'POST', '/withdraw', { query: { accountId: F, amount: -5 }, accounts: [F] });
await probe('E-WDR3', 'withdraw 0', 'POST', '/withdraw', { query: { accountId: F, amount: 0 }, accounts: [F] });
await probe('E-BIL1', 'billpay > balance (100000)', 'POST', '/billpay', {
  query: { accountId: F, amount: 100000 },
  body: payee({ accountNumber: A }),
  accounts: [F, A],
});
await probe('E-BIL2', 'billpay with empty payee {}', 'POST', '/billpay', {
  query: { accountId: F, amount: 1 },
  body: {},
  accounts: [F],
});
await probe('E-BIL3', 'billpay -5', 'POST', '/billpay', {
  query: { accountId: F, amount: -5 },
  body: payee({ accountNumber: A }),
  accounts: [F, A],
});
await probe('E-LON1', 'loan amount -100', 'POST', '/requestLoan', {
  query: { customerId, amount: -100, downPayment: 10, fromAccountId: F },
  accounts: [F],
});
await probe('E-LON2', 'loan down payment > balance', 'POST', '/requestLoan', {
  query: { customerId, amount: 1000, downPayment: 100000, fromAccountId: F },
  accounts: [F],
});
await probe('E-LON3', 'loan down payment > loan amount', 'POST', '/requestLoan', {
  query: { customerId, amount: 10, downPayment: 20, fromAccountId: F },
  accounts: [F],
});
await probe('E-LON4', 'loan amount 0', 'POST', '/requestLoan', {
  query: { customerId, amount: 0, downPayment: 0, fromAccountId: F },
  accounts: [F],
});
await probe('E-OPN1', 'create account from non-existent source -1', 'POST', '/createAccount', {
  query: { customerId, newAccountType: 0, fromAccountId: -1 },
});
if (positionForEdge) {
  await probe('E-INV1', 'sell more shares than owned (100)', 'POST', `/customers/${customerId}/sellPosition`, {
    query: { accountId: A, positionId: positionForEdge.positionId, shares: 100, pricePerShare: 10 },
    accounts: [A],
  });
}
await probe('E-TRX1', 'filter invalid date format', 'GET', `/accounts/${A}/transactions/onDate/not-a-date`);
await probe('E-TRX2', 'filter by amount non-numeric', 'GET', `/accounts/${A}/transactions/amount/abc`);
await probe('E-PRF1', 'update profile missing lastName', 'POST', `/customers/update/${customerId}`, {
  query: { ...user, lastName: undefined },
});
await probe('E-PRF2', 'customer after failed update', 'GET', `/customers/${customerId}`);

// ---------------- Destructive probe, last ----------------
// The 0.005 transfer makes both accounts and the customer's account list unreadable (HTTP 500, BUG-001),
// so it runs after every other probe: anything after it would only measure the broken accounts.
await probe('E-TRF7', 'transfer 3-decimal amount 0.005 (last: breaks the accounts)', 'POST', '/transfer', {
  query: { fromAccountId: F, toAccountId: A, amount: 0.005 },
  accounts: [F, A],
});

// ---------------- Write evidence ----------------
const dir = new URL('../../evidence/exploration/', import.meta.url);
const suffix = process.env.START_AT ? `-from-${process.env.START_AT}` : '';
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL(`observations${suffix}.json`, dir),
  JSON.stringify(
    {
      user: user.username,
      customerId,
      accounts: { A, B, F },
      accountsBeforeLoan: accsBeforeLoan.json,
      observations,
    },
    null,
    2,
  ),
);
const cell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .slice(0, 140);
const md = [
  `# Stage 1 observations — ${user.username} (customer ${customerId}), A=${A}, B=${B}, F=${F}`,
  '',
  `Run: ${observations[0]?.at} → ${observations.at(-1)?.at}. Credentials and SSN redacted.`,
  '',
  '| ID | Purpose | Request | Status | ms | Balances before → after | Body (excerpt) |',
  '|---|---|---|---|---|---|---|',
  ...observations.map(
    (o) =>
      `| ${o.id} | ${cell(o.purpose)} | ${o.method} ${cell(o.url.replace(api, ''))} | ${o.status} | ${o.ms} | ${
        o.before
          ? Object.keys(o.before)
              .map((k) => `${k}: ${o.before[k]} → ${o.after[k]}`)
              .join('; ')
          : ''
      } | ${cell(o.body)} |`,
  ),
];
writeFileSync(new URL(`observations${suffix}.md`, dir), md.join('\n') + '\n');

// Latency baseline (STD O7, load plan §1): unloaded response times of this run's probes per endpoint
// class. Paced requests from one client, so this is the "no load" reference for the SLA model.
const pct = (a, q) => {
  const v = [...a].sort((x, y) => x - y);
  return v.length ? v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)] : null;
};
const MONEY = /^\/(transfer|deposit|withdraw|billpay)/;
const classes = [
  ['Reads (all GET)', (o) => o.method === 'GET'],
  ['`GET /accounts/{id}`', (o) => o.method === 'GET' && /^\/accounts\/\d+$/.test(o.url.replace(api, '').split('?')[0])],
  [
    'Money writes (transfer, deposit, withdraw, bill pay)',
    (o) => o.method === 'POST' && MONEY.test(o.url.replace(api, '')),
  ],
  ['All writes (POST)', (o) => o.method === 'POST'],
];
const lat = [
  `# Latency baseline (unloaded) — ${observations[0]?.at?.slice(0, 10)}`,
  '',
  `Source: the ${observations.length} probes of this exploration run (\`observations.json\`), sent one at a time from one client, ${PACE_MS} ms apart. Times are client side and include the network and Cloudflare. HTTP 429 never occurred (the run stops on it).`,
  '',
  '| Class | n | p50 ms | p95 ms | max ms |',
  '|---|---|---|---|---|',
  ...classes.map(([label, f]) => {
    const ms = observations.filter(f).map((o) => o.ms);
    return `| ${label} | ${ms.length} | ${pct(ms, 0.5) ?? '—'} | ${pct(ms, 0.95) ?? '—'} | ${ms.length ? Math.max(...ms) : '—'} |`;
  }),
  '',
  'Used for the SLA model in deliverables/STD.md §4 (read p95 ≤ 1000 ms, write p95 ≤ 1500 ms) and as the "no load" reference in deliverables/load_test_plan.md.',
];
if (!suffix) writeFileSync(new URL('latency-baseline.md', dir), lat.join('\n') + '\n');
console.log(`\nWrote ${observations.length} observations to evidence/exploration/`);
