// Builds tests/postman/ParaBank_QA.postman_collection.json (Postman v2.1) from the STD (STD.md §5).
//
// Design:
// - One request per API call; test names start with the STD case ID and the basis tag
//   ([C#] contract, [A#] proposed rule). Observed (O#) and Open items are logged, never asserted.
// - Money checks use account-list snapshots (GET /customers/{id}/accounts) before and after,
//   compared in integer cents. A rejected request must change nothing.
// - Every money suite starts with its own fixture block (fresh accounts S and T), so each
//   suite can run alone after "10 Suite fixtures".
// - On any failed check a request logs one redacted JSON record (kind FAILED) for Stage 4.
//
// Usage: node tests/scripts/build-collection.mjs   (run.sh calls it before every API run)

import { writeFileSync } from 'node:fs';

// Output file (regenerated before every API run, so the JSON never drifts from this builder).
const OUT = new URL('../postman/ParaBank_QA.postman_collection.json', import.meta.url);

// ---------------------------------------------------------------- shared script code

// JSON schemas of the API's objects (from the OpenAPI spec), used by the [C#] contract checks.
const SCHEMAS = {
  customer: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          zipCode: { type: 'string' },
        },
      },
      phoneNumber: { type: 'string' },
      ssn: { type: 'string' },
    },
  },
  account: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      customerId: { type: 'integer' },
      type: { type: 'string', enum: ['CHECKING', 'SAVINGS', 'LOAN'] },
      balance: { type: 'number' },
    },
  },
  // Transaction without `date`: its type is checked separately (contract discrepancy C-02)
  transaction: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      accountId: { type: 'integer' },
      type: { type: 'string', enum: ['Credit', 'Debit'] },
      amount: { type: 'number' },
      description: { type: 'string' },
    },
  },
  billPayResult: {
    type: 'object',
    properties: { payeeName: { type: 'string' }, amount: { type: 'number' }, accountId: { type: 'integer' } },
  },
  loanResponse: {
    type: 'object',
    required: ['loanProviderName'],
    properties: {
      responseDate: { type: 'string' },
      loanProviderName: { type: 'string' },
      approved: { type: 'boolean' },
      message: { type: 'string' },
      accountId: { type: ['integer', 'null'] },
    },
  },
  position: {
    type: 'object',
    properties: {
      positionId: { type: 'integer' },
      customerId: { type: 'integer' },
      name: { type: 'string' },
      symbol: { type: 'string' },
      shares: { type: 'integer' },
      purchasePrice: { type: 'number' },
    },
  },
};

// Helper library prepended to every request's test script (Postman scripts can't import modules):
// check() / log helpers, status checks, schema validation, balance snapshots, date and subset helpers.
const LIB = `
const NAME = pm.info.requestName;
const CASE = NAME.split(' · ')[0];
const SCHEMAS = ${JSON.stringify(SCHEMAS)};
const failures = [];
function check(label, fn) {
  pm.test(CASE + ' ' + label, function () {
    try { fn(); } catch (e) { failures.push(label + ': ' + e.message); throw e; }
  });
}
function log(kind, label, detail) { console.log(JSON.stringify({ kind: kind, case: CASE, label: label, detail: detail })); }
function observe(label, same, detail) { log(same ? 'OBSERVED-SAME' : 'OBSERVED-CHANGED', label, detail); }
function record(label, detail) { log('RECORD', label, detail); }
function blocked(label, why) { log('BLOCKED', label, why); }
function cents(x) { return Math.round(Number(x) * 100); }
function json() { try { return pm.response.json(); } catch (e) { return undefined; } }
function v(k) { const x = pm.variables.get(k); return x === undefined ? '' : String(x); }
function set(k, val) { pm.collectionVariables.set(k, typeof val === 'string' ? val : JSON.stringify(val)); }
function getJ(k) { const s = pm.collectionVariables.get(k); try { return s ? JSON.parse(s) : undefined; } catch (e) { return undefined; } }
function code() { return pm.response.code; }
function is200() { check('[C1] HTTP 200 (got ' + code() + ')', function () { pm.expect(code()).to.eql(200); }); return code() === 200; }
function is4xx(tag) { check('[' + tag + '] rejected with 4xx (got ' + code() + ')', function () { pm.expect(code()).to.be.within(400, 499); }); }
function no5xx() { check('[A8] no server error (got ' + code() + ')', function () { pm.expect(code()).to.be.below(500); }); }
function noData(tag, field) {
  check('[' + tag + '] no ' + field + ' data returned', function () { const j = json(); pm.expect(!!(j && j[field] !== undefined)).to.eql(false); });
}
const ajv = new (require('ajv'))({ allErrors: true, logger: false });
function valid(name, value) { const ok = ajv.validate(SCHEMAS[name], value); return { ok: ok, why: ok ? '' : ajv.errorsText() }; }
function schema(name, value) {
  const r = valid(name, value);
  check('[C1] ' + name + ' schema' + (r.ok ? '' : ' (' + r.why + ')'), function () { pm.expect(r.ok).to.eql(true); });
}
function schemaList(name) {
  const j = json();
  check('[C1] list of ' + name, function () { pm.expect(j).to.be.an('array'); });
  if (Array.isArray(j)) j.forEach(function (x, i) { const r = valid(name, x); if (!r.ok) check('[C1] ' + name + ' schema (item ' + i + ': ' + r.why + ')', function () { pm.expect.fail(r.why); }); });
}
// Snapshots: map accountId -> balance in cents, rolled so every snapshot compares with the previous one
function snapNow() { const m = {}; const j = json(); if (Array.isArray(j)) j.forEach(function (a) { m[a.id] = cents(a.balance); }); return m; }
function rollSnap() {
  const cur = snapNow();
  const prev = getJ('snap_cur') || {};
  set('snap_prev', prev); set('snap_cur', cur);
  return { prev: prev, cur: cur };
}
function unchanged(tag, s, ids) {
  ids.forEach(function (id) {
    check('[' + tag + '] account ' + id + ' balance unchanged (' + s.prev[id] + ' -> ' + s.cur[id] + ' cents)', function () { pm.expect(s.cur[id]).to.eql(s.prev[id]); });
  });
}
function delta(tag, s, id, d) {
  check('[' + tag + '] account ' + id + ' changed by ' + d + ' cents (' + s.prev[id] + ' -> ' + s.cur[id] + ')', function () { pm.expect(s.cur[id] - s.prev[id]).to.eql(d); });
}
// Transaction dates: the API returns epoch ms at 00:00 UTC (O2); a row's date = its UTC calendar date
function rowDay(r) { const d = new Date(r.date); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function ids(rows) { return (rows || []).map(function (r) { return r.id; }).sort(function (a, b) { return a - b; }); }
// Subset rule (STD §4): filter result = exactly the matching rows of the unfiltered list
function subset(tag, fullKey, label, pred) {
  const full = getJ(fullKey);
  if (!full) { blocked(label, 'no unfiltered list ' + fullKey); return; }
  const want = ids(full.filter(pred));
  const got = ids(json());
  check('[' + tag + '] result = rows of the unfiltered list ' + label + ' (want ' + JSON.stringify(want) + ', got ' + JSON.stringify(got) + ')', function () { pm.expect(got).to.eql(want); });
  return got;
}
function newRows(rows, baseIds) { return (rows || []).filter(function (r) { return baseIds.indexOf(r.id) < 0; }); }
function sig(rows) { return rows.map(function (r) { return r.type + ' ' + cents(r.amount); }).sort(); }
`;

// Runs after every request's own tests: structured, redacted record of any failure (plan §3.2 step 7)
const FOOTER = `
if (failures.length) {
  const secrets = [pm.variables.get('password'), pm.variables.get('ssn')].filter(Boolean).map(String);
  const redact = function (s) {
    s = String(s === undefined ? '' : s);
    secrets.forEach(function (x) {
      [x, encodeURIComponent(x), encodeURIComponent(x).replace(/%20/g, '+'), JSON.stringify(x).slice(1, -1)].forEach(function (e) { s = s.split(e).join('<REDACTED>'); });
    });
    return s;
  };
  console.log(JSON.stringify({
    kind: 'FAILED', runId: pm.collectionVariables.get('runId'), at: new Date().toISOString(), case: CASE, request: NAME,
    method: pm.request.method, url: redact(pm.request.url.toString()), requestBody: redact(pm.request.body ? pm.request.body.toString() : ''),
    status: code(), ms: pm.response.responseTime, response: redact(pm.response.text()).slice(0, 1500),
    failures: failures.map(redact), snapPrev: getJ('snap_prev'), snapCur: getJ('snap_cur'),
  }));
}
`;

// Collection-level pre-request: run id, dates, JSON accept header, forbidden-endpoint guard
const COLLECTION_PRE = `
if (!pm.collectionVariables.get('runId')) pm.collectionVariables.set('runId', new Date().toISOString().replace(/[:.]/g, '-'));
const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
pm.collectionVariables.set('today', pad(now.getUTCMonth() + 1) + '-' + pad(now.getUTCDate()) + '-' + now.getUTCFullYear());
pm.collectionVariables.set('monthName', ['January','February','March','April','May','June','July','August','September','October','November','December'][now.getUTCMonth()]);
pm.collectionVariables.set('monthNum', String(now.getUTCMonth() + 1));
pm.request.headers.upsert({ key: 'Accept', value: 'application/json' });
if (/cleanDB|initializeDB|setParameter|JmsListener/i.test(pm.request.url.getPath())) throw new Error('Forbidden endpoint: ' + pm.request.url.getPath());
`;

// ---------------------------------------------------------------- request builders

// Postman stores scripts as arrays of lines; qs() builds a request's query parameter list.
const lines = (s) => s.trim().split('\n');
const qs = (query) => {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

// One Postman request item: URL with {{variables}}, optional JSON body, and test script = LIB + tests + FOOTER.
function req(name, method, path, { query, body, tests = '', pre = '', desc } = {}) {
  const item = {
    name,
    request: {
      method,
      header: body !== undefined ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: `{{baseUrl}}${path}${qs(query)}`,
      ...(body !== undefined
        ? { body: { mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2) } }
        : {}),
      ...(desc ? { description: desc } : {}),
    },
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: lines(`${LIB}\n// ---- checks\n${tests}\n// ---- failure log\n${FOOTER}`),
        },
      },
    ],
  };
  if (pre) item.event.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(pre) } });
  return item;
}
// A folder of requests (one per suite / phase).
const folder = (name, items, description) => ({ name, ...(description ? { description } : {}), item: items });

// Account-list snapshot request: rolls the previous / current balance maps used by unchanged() and delta().
const snapshot = (name, tests = '') =>
  req(name, 'GET', '/customers/{{custId}}/accounts', {
    tests: `
const s = rollSnap();
check('[C1] account list readable (got ' + code() + ')', function () { pm.expect(code()).to.eql(200); });
${tests}`,
  });

// Pre-request that removes any cookie, so the call is made as an anonymous client
const ANON = `pm.request.headers.remove('Cookie'); pm.request.headers.remove('Authorization');`;

// Bill-pay payee body used by the BIL suite and the journey.
const payee = (accountNumber) => ({
  name: 'City Utilities',
  address: { street: '1 Main St', city: 'Springfield', state: 'IL', zipCode: '62701' },
  phoneNumber: '5550100',
  accountNumber,
});

// Login used by the fixtures and smoke: stores custId and A (default = lowest account id)
const login = (name, extra = '') =>
  req(name, 'GET', '/login/{{username}}/{{password}}', {
    tests: `
if (is200()) {
  const c = json();
  schema('customer', c);
  set('custId', String(c.id)); set('loginCustomer', c);
  check('[A7] profile = registration data', function () {
    pm.expect({ firstName: c.firstName, lastName: c.lastName, street: c.address && c.address.street, city: c.address && c.address.city,
      state: c.address && c.address.state, zipCode: c.address && c.address.zipCode, phoneNumber: c.phoneNumber, ssn: c.ssn })
      .to.eql({ firstName: v('firstName'), lastName: v('lastName'), street: v('street'), city: v('city'), state: v('state'),
      zipCode: v('zipCode'), phoneNumber: v('phoneNumber'), ssn: v('ssn') });
  });
  record('session', { setCookie: pm.response.headers.has('Set-Cookie') });
}
${extra}`,
  });

// Account list request that also stores A (the lowest account ID).
const listAccountsSetA = (name) =>
  req(name, 'GET', '/customers/{{custId}}/accounts', {
    tests: `
if (is200()) {
  schemaList('account');
  const list = json() || [];
  check('[C1] at least one account', function () { pm.expect(list.length).to.be.above(0); });
  check('[A6] every account belongs to the customer', function () { list.forEach(function (a) { pm.expect(String(a.customerId)).to.eql(v('custId')); }); });
  const A = list.slice().sort(function (a, b) { return a.id - b.id; })[0];
  if (A) set('A', String(A.id));
  set('accountList', list);
  rollSnap();
}`,
  });

// Fresh accounts for one suite. Fallback when /createAccount fails: S = fallbackAccountId, T = A
function fixtures(tag, needT = true) {
  const open = (v) =>
    req(`FIX-${tag} · open ${v}`, 'POST', '/createAccount', {
      query: { customerId: '{{custId}}', newAccountType: 0, fromAccountId: '{{A}}' },
      tests: `
const j = json();
if (code() === 200 && j && j.id) { set('${v}', String(j.id)); record('fixture', { ${v}: j.id }); }
else { set('${v}', v('${v === 'S' ? 'fallbackAccountId' : 'A'}')); blocked('fixture', 'createAccount failed (' + code() + '): ${v} = ${v === 'S' ? 'fallbackAccountId' : 'A'}'); }`,
    });
  return [
    req(`FIX-${tag} · fund A with 300.00`, 'POST', '/deposit', {
      query: { accountId: '{{A}}', amount: 300 },
      tests: `if (code() !== 200) blocked('fixture', 'deposit to A failed (' + code() + ')');`,
    }),
    open('S'),
    ...(needT ? [open('T')] : []),
    snapshot(
      `FIX-${tag} · snapshot`,
      `
check('[C1] fixture accounts listed', function () { pm.expect(s.cur).to.have.property(v('S')); ${needT ? "pm.expect(s.cur).to.have.property(v('T'));" : ''} });`,
    ),
  ];
}

// Pre-request that sets {{amt}} from the latest snapshot: balance of S + extra (in cents)
const amtFromS = (extraCents) => `
const cur = JSON.parse(pm.collectionVariables.get('snap_cur') || '{}');
const bal = cur[pm.variables.get('S')];
pm.collectionVariables.set('amt', ((bal + ${extraCents}) / 100).toFixed(2));`;

// Overdraft defects leave S far below zero; the loan check looks at the customer's total balance,
// so every suite restores S to 0.00 at its end to keep the suites independent.
const cleanup = (tag) =>
  req(`FIX-${tag} · cleanup: restore S to 0.00`, 'POST', '/deposit', {
    query: { accountId: '{{S}}', amount: '{{amt}}' },
    pre: `
const cur = JSON.parse(pm.collectionVariables.get('snap_cur') || '{}');
const bal = cur[pm.variables.get('S')];
if (!(bal < 0)) pm.execution.skipRequest();
else pm.collectionVariables.set('amt', (-bal / 100).toFixed(2));`,
    tests: `record('cleanup', { deposited: v('amt'), status: code() });`,
  });

// ---------------------------------------------------------------- 00 Smoke

// Smoke: the five cases that prove the API is usable at all; a failure blocks everything else.
const smoke = folder(
  '00 Smoke',
  [
    login('AUTH-01 · login'),
    req('CUST-01 · get customer', 'GET', '/customers/{{custId}}', {
      tests: `
if (is200()) {
  schema('customer', json());
  check('[A7] same details as the login response', function () { pm.expect(json()).to.eql(getJ('loginCustomer')); });
}`,
    }),
    listAccountsSetA('ACCT-01 · list accounts'),
    req('ACCT-02 · account details of A', 'GET', '/accounts/{{A}}', {
      tests: `
if (is200()) {
  const a = json();
  schema('account', a);
  const fromList = (getJ('accountList') || []).filter(function (x) { return String(x.id) === v('A'); })[0];
  check('[A7] same values as the account list', function () { pm.expect(a).to.eql(fromList); });
}`,
    }),
    req('DEP-01 · baseline transactions of A', 'GET', '/accounts/{{A}}/transactions', {
      tests: `
if (is200()) set('baseA', ids(json()));`,
    }),
    req('DEP-01 · deposit 10.00 into A', 'POST', '/deposit', {
      query: { accountId: '{{A}}', amount: 10 },
      tests: `
is200();
observe('[O5] success text', /^Successfully deposited/.test(pm.response.text()), pm.response.text().slice(0, 80));`,
    }),
    snapshot('DEP-01 · balances after deposit', `delta('A2', s, v('A'), 1000);`),
    req('HIST-01 · transactions of A', 'GET', '/accounts/{{A}}/transactions', {
      tests: `
if (is200()) {
  schemaList('transaction');
  const fresh = newRows(json(), getJ('baseA') || []);
  check('[A2] exactly one new transaction: Credit 1000 cents (got ' + JSON.stringify(sig(fresh)) + ')', function () { pm.expect(sig(fresh)).to.eql(['Credit 1000']); });
  if (fresh[0]) check('[A2] new transaction dated today, UTC (got ' + rowDay(fresh[0]) + ')', function () { pm.expect(rowDay(fresh[0])).to.eql(todayIso()); });
}`,
    }),
  ],
  'Gate: if any check here fails, stop the run and mark everything BLOCKED. In-scope endpoints only, one write.',
);

// ---------------------------------------------------------------- 10 Suite fixtures + suites

// Endpoint suites: one folder per area; each money suite opens its own fresh accounts first.
const suiteLogin = folder(
  '10 Suite fixtures',
  [login('FIX · login'), listAccountsSetA('FIX · accounts')],
  'Run before any suite folder: stores custId and A. Each suite then opens its own fresh S and T.',
);

const logSuite = folder('11 LOG Login', [
  req('AUTH-02 · wrong password', 'GET', '/login/{{username}}/WrongPass-000', {
    tests: `
noData('A9', 'id');
no5xx();
record('[Open] status code', { status: code(), body: pm.response.text().slice(0, 120) });
set('auth02', { status: code(), body: pm.response.text() });`,
  }),
  req('AUTH-04 · unknown user', 'GET', '/login/qa_nouser_{{$timestamp}}/WrongPass-000', {
    tests: `
noData('A9', 'id');
const a2 = getJ('auth02');
if (!a2) blocked('compare', 'AUTH-02 did not run');
else check('[A9] same status and body as a wrong password', function () { pm.expect({ status: code(), body: pm.response.text() }).to.eql(a2); });`,
  }),
]);

const cusSuite = folder('12 CUS Customer', [
  req('CUST-02 · customer -1', 'GET', '/customers/-1', {
    tests: `
noData('A8', 'id'); no5xx(); is4xx('A8');
record('[Open] status code', code());`,
  }),
  req('CUST-03 · profile without logging in', 'GET', '/customers/{{custId}}', {
    pre: ANON,
    tests: `
check('[A6] rejected with 401 or 403 (got ' + code() + ')', function () { pm.expect([401, 403]).to.include(code()); });
check('[A6] no SSN in the response', function () { pm.expect(pm.response.text()).to.not.include(v('ssn')); });`,
  }),
]);

const accSuite = folder('13 ACC Accounts', [
  req('ACCT-03 · account -1', 'GET', '/accounts/-1', {
    tests: `noData('A8', 'id'); no5xx(); is4xx('A8'); record('[Open] status code', code());`,
  }),
  req('ACCT-03 · account 0', 'GET', '/accounts/0', {
    tests: `noData('A8', 'id'); no5xx(); is4xx('A8'); record('[Open] status code', code());`,
  }),
  req('ACCT-04 · account without logging in', 'GET', '/accounts/{{A}}', {
    pre: ANON,
    tests: `
check('[A6] rejected with 401 or 403 (got ' + code() + ')', function () { pm.expect([401, 403]).to.include(code()); });
noData('A6', 'balance');`,
  }),
  req('ACCT-05 · account id abc', 'GET', '/accounts/abc', { tests: `no5xx(); is4xx('A8');` }),
]);

const trfSuite = folder('14 TRF Transfer', [
  ...fixtures('TRF'),
  req('TRF-01 · transfer 1.00 S to T', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{T}}', amount: 1 },
    tests: `
is200();
observe('[O5] success text', /^Successfully transferred/.test(pm.response.text()), pm.response.text().slice(0, 80));`,
  }),
  snapshot(
    'TRF-01 · balances after',
    `
delta('A1', s, v('S'), -100); delta('A1', s, v('T'), 100);
check('[A1] total of S + T unchanged', function () { pm.expect(s.cur[v('S')] + s.cur[v('T')]).to.eql(s.prev[v('S')] + s.prev[v('T')]); });`,
  ),
  req('TRF-01 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) { const r = json().filter(function (x) { return cents(x.amount) === 100; });
  check('[A2] exactly one 1.00 transaction on S, a Debit (got ' + JSON.stringify(sig(r)) + ')', function () { pm.expect(sig(r)).to.eql(['Debit 100']); }); }`,
  }),
  req('TRF-01 · transactions of T', 'GET', '/accounts/{{T}}/transactions', {
    tests: `
if (is200()) { const r = json().filter(function (x) { return cents(x.amount) === 100; });
  check('[A2] exactly one 1.00 transaction on T, a Credit (got ' + JSON.stringify(sig(r)) + ')', function () { pm.expect(sig(r)).to.eql(['Credit 100']); }); }`,
  }),
  req('TRF-10 · transfer the exact balance of S', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{T}}', amount: '{{amt}}' },
    pre: amtFromS(0),
    tests: `is200(); record('amount', v('amt'));`,
  }),
  snapshot(
    'TRF-10 · balances after',
    `
check('[A1] S is 0.00 (got ' + s.cur[v('S')] + ' cents)', function () { pm.expect(s.cur[v('S')]).to.eql(0); });
check('[A1] total of S + T unchanged', function () { pm.expect(s.cur[v('S')] + s.cur[v('T')]).to.eql(s.prev[v('S')] + s.prev[v('T')]); });`,
  ),
  req('TRF-02 · transfer more than the balance', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{T}}', amount: '{{amt}}' },
    pre: amtFromS(100000),
    tests: `is4xx('A4'); record('amount', v('amt'));`,
  }),
  snapshot('TRF-02 · balances after', `unchanged('A4', s, [v('S'), v('T')]);`),
  req('TRF-03 · transfer -1.00', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{T}}', amount: -1 },
    tests: `is4xx('A3');`,
  }),
  snapshot('TRF-03 · balances after', `unchanged('A3', s, [v('S'), v('T')]);`),
  req('TRF-04 · transfer 0.00', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{T}}', amount: 0 },
    tests: `is4xx('A3');`,
  }),
  req('TRF-04 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) { const z = json().filter(function (x) { return cents(x.amount) === 0; });
  check('[A3] no 0.00 transaction created (found ' + z.length + ')', function () { pm.expect(z.length).to.eql(0); }); }`,
  }),
  req('TRF-05 · transfer to the same account', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{S}}', amount: 1 },
    tests: `is4xx('A10');`,
  }),
  snapshot('TRF-05 · balances after', `unchanged('A10', s, [v('S')]);`),
  req('TRF-06 · transfer to account -1', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: -1, amount: 1 },
    tests: `no5xx(); is4xx('A8'); record('[Open] status code', code());`,
  }),
  snapshot('TRF-06 · balances after', `unchanged('A8', s, [v('S')]);`),
  req('TRF-07 · transfer without amount', 'POST', '/transfer', {
    query: { fromAccountId: '{{S}}', toAccountId: '{{T}}' },
    tests: `is4xx('C1'); no5xx();`,
  }),
  snapshot('TRF-07 · balances after', `unchanged('A8', s, [v('S'), v('T')]);`),
  cleanup('TRF'),
]);

const depSuite = folder('15 DEP Deposit', [
  ...fixtures('DEP', false),
  req('DEP-02 · deposit 0.00', 'POST', '/deposit', { query: { accountId: '{{S}}', amount: 0 }, tests: `is4xx('A3');` }),
  req('DEP-02 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) { const z = json().filter(function (x) { return cents(x.amount) === 0; });
  check('[A3] no 0.00 transaction created (found ' + z.length + ')', function () { pm.expect(z.length).to.eql(0); }); }`,
  }),
  req('DEP-03 · deposit -5.00', 'POST', '/deposit', {
    query: { accountId: '{{S}}', amount: -5 },
    tests: `is4xx('A3');`,
  }),
  snapshot('DEP-03 · balances after', `unchanged('A3', s, [v('S')]);`),
  cleanup('DEP'),
]);

const wdrSuite = folder('16 WDR Withdraw', [
  ...fixtures('WDR', false),
  req('WDR-01 · withdraw 5.00', 'POST', '/withdraw', {
    query: { accountId: '{{S}}', amount: 5 },
    tests: `
is200();
observe('[O5] success text', /^Successfully withdrew/.test(pm.response.text()), pm.response.text().slice(0, 80));`,
  }),
  snapshot('WDR-01 · balances after', `delta('A2', s, v('S'), -500);`),
  req('WDR-01 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) { const r = json().filter(function (x) { return cents(x.amount) === 500; });
  check('[A2] exactly one 5.00 Debit on S (got ' + JSON.stringify(sig(r)) + ')', function () { pm.expect(sig(r)).to.eql(['Debit 500']); }); }`,
  }),
  req('WDR-02 · withdraw more than the balance', 'POST', '/withdraw', {
    query: { accountId: '{{S}}', amount: '{{amt}}' },
    pre: amtFromS(100000),
    tests: `is4xx('A4'); record('amount', v('amt'));`,
  }),
  snapshot('WDR-02 · balances after', `unchanged('A4', s, [v('S')]);`),
  req('WDR-03 · withdraw -5.00', 'POST', '/withdraw', {
    query: { accountId: '{{S}}', amount: -5 },
    tests: `is4xx('A3');`,
  }),
  snapshot('WDR-03 · balances after', `unchanged('A3', s, [v('S')]);`),
  req('WDR-04 · withdraw 0.00', 'POST', '/withdraw', {
    query: { accountId: '{{S}}', amount: 0 },
    tests: `is4xx('A3');`,
  }),
  req('WDR-04 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) { const z = json().filter(function (x) { return cents(x.amount) === 0; });
  check('[A3] no 0.00 transaction created (found ' + z.length + ')', function () { pm.expect(z.length).to.eql(0); }); }`,
  }),
  snapshot('WDR-04 · balances after'),
  cleanup('WDR'),
]);

const bilSuite = folder('17 BIL Bill pay', [
  ...fixtures('BIL'),
  req('BILL-01 · pay 5.00 to City Utilities', 'POST', '/billpay', {
    query: { accountId: '{{S}}', amount: 5 },
    body: payee('{{T}}'),
    tests: `
if (is200()) {
  const r = json();
  schema('billPayResult', r);
  check('[A7] echoes payee, amount and account sent', function () {
    pm.expect({ payeeName: r.payeeName, amount: cents(r.amount), accountId: String(r.accountId) }).to.eql({ payeeName: 'City Utilities', amount: 500, accountId: v('S') });
  });
}`,
  }),
  snapshot(
    'BILL-01 · balances after',
    `
delta('A2', s, v('S'), -500);
record('payee account T change (cents)', s.cur[v('T')] - s.prev[v('T')]);`,
  ),
  req('BILL-01 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) { const r = json().filter(function (x) { return cents(x.amount) === 500; });
  check('[A2] exactly one 5.00 Debit on S (got ' + JSON.stringify(sig(r)) + ')', function () { pm.expect(sig(r)).to.eql(['Debit 500']); }); }`,
  }),
  req('BILL-02 · pay more than the balance', 'POST', '/billpay', {
    query: { accountId: '{{S}}', amount: '{{amt}}' },
    body: payee('{{T}}'),
    pre: amtFromS(100000),
    tests: `is4xx('A4'); record('amount', v('amt'));`,
  }),
  snapshot('BILL-02 · balances after', `unchanged('A4', s, [v('S')]);`),
  req('BILL-03 · pay with an empty payee', 'POST', '/billpay', {
    query: { accountId: '{{S}}', amount: 1 },
    body: '{}',
    tests: `is4xx('A11'); no5xx(); record('[Open] status code', code());`,
  }),
  snapshot('BILL-03 · balances after', `unchanged('A11', s, [v('S')]);`),
  req('BILL-04 · pay -5.00', 'POST', '/billpay', {
    query: { accountId: '{{S}}', amount: -5 },
    body: payee('{{T}}'),
    tests: `is4xx('A3');`,
  }),
  snapshot('BILL-04 · balances after', `unchanged('A3', s, [v('S')]);`),
  cleanup('BIL'),
]);

// Loan: contract (schema), proposed rule (A12) and observation (O4) are checked separately
const loanAfter = (tag) => `
const before = Object.keys(s.prev), added = Object.keys(s.cur).filter(function (id) { return before.indexOf(id) < 0; });
record('accounts added', added);
`;
const lonSuite = folder('18 LON Loan', [
  ...fixtures('LON', false),
  req('LOAN-01 · request loan 500, down payment 50', 'POST', '/requestLoan', {
    query: { customerId: '{{custId}}', amount: 500, downPayment: 50, fromAccountId: '{{S}}' },
    tests: `
set('L', ''); set('approved', '');
if (is200()) {
  const r = json();
  schema('loanResponse', r);
  check('[C1] approved is a boolean', function () { pm.expect(r.approved).to.be.a('boolean'); });
  set('approved', String(r.approved));
  if (r.approved) { check('[C1] accountId present when approved', function () { pm.expect(r.accountId).to.be.a('number'); }); set('L', String(r.accountId || '')); }
  record('[Open] approval decision', { approved: r.approved, message: r.message, provider: r.loanProviderName });
}`,
  }),
  snapshot(
    'LOAN-01 · balances after',
    `${loanAfter()}
if (v('approved') === 'true') {
  delta('A12', s, v('S'), -5000);
  check('[A12] loan account listed for the customer', function () { pm.expect(s.cur).to.have.property(v('L')); });
  observe('[O4] loan account holds 500.00', s.cur[v('L')] === 50000, { loanAccountCents: s.cur[v('L')] });
} else if (v('approved') === 'false') {
  unchanged('A12', s, [v('S')]);
  check('[A12] no account added when denied', function () { pm.expect(added).to.eql([]); });
} else blocked('loan result', 'LOAN-01 request failed');`,
  ),
  req('LOAN-01 · transactions of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (v('approved') !== 'true') blocked('down payment row', 'loan not approved');
else if (is200()) { const r = json().filter(function (x) { return cents(x.amount) === 5000 && x.type === 'Debit'; });
  check('[A12] down payment 50.00 recorded as a Debit on S (found ' + r.length + ')', function () { pm.expect(r.length).to.eql(1); }); }`,
  }),
  req('LOAN-01 · transactions of the loan account', 'GET', '/accounts/{{L}}/transactions', {
    tests: `
if (v('approved') !== 'true') blocked('loan entry', 'loan not approved');
else if (is200()) {
  record('loan account transactions', json());
  check('[A12] the loan is recorded in the loan account history (found ' + json().length + ')', function () { pm.expect(json().length).to.be.above(0); });
}`,
  }),
  req('LOAN-02 · request loan -100', 'POST', '/requestLoan', {
    query: { customerId: '{{custId}}', amount: -100, downPayment: 10, fromAccountId: '{{S}}' },
    tests: `
const r = json();
check('[A3] rejected (4xx) or denied (got ' + code() + ', approved ' + (r && r.approved) + ')', function () { pm.expect(code() >= 400 && code() < 500 || (r && r.approved === false)).to.eql(true); });`,
  }),
  snapshot(
    'LOAN-02 · balances after',
    `${loanAfter()}
unchanged('A3', s, [v('S')]);
check('[A3] no loan account opened', function () { pm.expect(added).to.eql([]); });`,
  ),
  req('LOAN-03 · down payment larger than the loan', 'POST', '/requestLoan', {
    query: { customerId: '{{custId}}', amount: 10, downPayment: 20, fromAccountId: '{{S}}' },
    tests: `
const r = json();
no5xx();
record('[Open] behavior', { status: code(), approved: r && r.approved, message: r && r.message });`,
  }),
  snapshot(
    'LOAN-03 · balances after',
    `${loanAfter()}
record('[Open] S change (cents)', s.cur[v('S')] - s.prev[v('S')]);`,
  ),
  req('LOAN-04 · down payment larger than the balance', 'POST', '/requestLoan', {
    query: { customerId: '{{custId}}', amount: 1000, downPayment: '{{amt}}', fromAccountId: '{{S}}' },
    pre: amtFromS(100000),
    tests: `
const r = json();
check('[A4] denied (got ' + code() + ', approved ' + (r && r.approved) + ')', function () { pm.expect(code() >= 400 && code() < 500 || (r && r.approved === false)).to.eql(true); });`,
  }),
  snapshot(
    'LOAN-04 · balances after',
    `${loanAfter()}
unchanged('A4', s, [v('S')]);
check('[A4] no loan account opened', function () { pm.expect(added).to.eql([]); });`,
  ),
  cleanup('LON'),
]);

const trxSuite = folder('19 TRX Transactions', [
  ...fixtures('TRX', false),
  req('FIX-TRX · deposit 10.00 into S', 'POST', '/deposit', {
    query: { accountId: '{{S}}', amount: 10 },
    tests: `if (code() !== 200) blocked('fixture', 'deposit failed');`,
  }),
  req('FIX-TRX · withdraw 5.00 from S', 'POST', '/withdraw', {
    query: { accountId: '{{S}}', amount: 5 },
    tests: `if (code() !== 200) blocked('fixture', 'withdraw failed');`,
  }),
  req('HIST-01 · unfiltered list of S', 'GET', '/accounts/{{S}}/transactions', {
    tests: `
if (is200()) {
  set('fullS', json());
  schemaList('transaction');
  const r = json()[0];
  check('[C1] Transaction.date is a date-time string (got ' + (r && typeof r.date) + ')', function () { pm.expect(r && typeof r.date).to.eql('string'); });
  record('rows', json().length);
}`,
    desc: 'Reference list for the subset rule (STD §4). Also checks the contract type of Transaction.date (discrepancy C-02).',
  }),
  req('HIST-02 · filter by amount 10', 'GET', '/accounts/{{S}}/transactions/amount/10', {
    tests: `
if (is200()) subset('C2', 'fullS', 'with amount 10.00', function (r) { return cents(r.amount) === 1000; });`,
  }),
  req('HIST-03 · filter onDate today', 'GET', '/accounts/{{S}}/transactions/onDate/{{today}}', {
    tests: `
if (is200()) set('onDateIds', subset('C2', 'fullS', 'dated today', function (r) { return rowDay(r) === todayIso(); }) || []);`,
  }),
  req(
    'HIST-03 · filter fromDate today toDate today',
    'GET',
    '/accounts/{{S}}/transactions/fromDate/{{today}}/toDate/{{today}}',
    {
      tests: `
if (is200()) {
  const got = subset('C2', 'fullS', 'dated today', function (r) { return rowDay(r) === todayIso(); });
  check('[C2] same rows as onDate', function () { pm.expect(got).to.eql(getJ('onDateIds')); });
}`,
    },
  ),
  ...['Credit', 'Debit'].map((t) =>
    req(`HIST-04 · month name, type ${t}`, 'GET', `/accounts/{{S}}/transactions/month/{{monthName}}/type/${t}`, {
      tests: `
if (is200()) subset('C2', 'fullS', 'in this month with type ${t}', function (r) { return rowDay(r).slice(0, 7) === todayIso().slice(0, 7) && r.type === '${t}'; });`,
    }),
  ),
  req('HIST-04 · month name, type All', 'GET', '/accounts/{{S}}/transactions/month/{{monthName}}/type/All', {
    tests: `
if (is200()) subset('C2', 'fullS', 'in this month (any type)', function (r) { return rowDay(r).slice(0, 7) === todayIso().slice(0, 7); });`,
  }),
  req('HIST-04 · month number, type All', 'GET', '/accounts/{{S}}/transactions/month/{{monthNum}}/type/All', {
    tests: `
if (is200()) subset('C2', 'fullS', 'in this month (any type)', function (r) { return rowDay(r).slice(0, 7) === todayIso().slice(0, 7); });`,
  }),
  req('HIST-04 · type CREDIT (wrong case)', 'GET', '/accounts/{{S}}/transactions/month/{{monthName}}/type/CREDIT', {
    tests: `no5xx(); is4xx('A8');`,
  }),
  req('HIST-05 · onDate in ISO format', 'GET', '/accounts/{{S}}/transactions/onDate/2026-11-23', {
    tests: `is4xx('A8'); record('body', pm.response.text().slice(0, 120));`,
  }),
  req('HIST-05 · onDate not-a-date', 'GET', '/accounts/{{S}}/transactions/onDate/not-a-date', {
    tests: `no5xx(); is4xx('A8');`,
  }),
  req('HIST-06 · one transaction by id', 'GET', '/transactions/{{trxId}}', {
    pre: `const f = JSON.parse(pm.collectionVariables.get('fullS') || '[]'); pm.collectionVariables.set('trxId', f[0] ? String(f[0].id) : '0');`,
    tests: `
if (is200()) {
  const row = (getJ('fullS') || []).filter(function (r) { return String(r.id) === v('trxId'); })[0];
  check('[A7] same fields as in the list', function () { pm.expect(json()).to.eql(row); });
}`,
  }),
]);

// ---------------------------------------------------------------- 01 Customer Journey (STD §5.6 call table)

// Journey helpers: request names "JRN-01 Jxx · title", A read-backs, and the expected-balance ledger checks.
const J = (step, title) => `JRN-01 ${step} · ${title}`;
const readA = (step, title, tests) => req(J(step, title), 'GET', '/accounts/{{A}}', { tests });
const expCheck = (acct, expVar, label) => `
if (is200()) {
  const exp = Number(v('${expVar}'));
  check('${label} ${acct} = expected ' + exp + ' cents (got ' + cents(json().balance) + ')', function () { pm.expect(cents(json().balance)).to.eql(exp); });
}`;
const addExp = (expVar, d, okCond = 'code() === 200') =>
  `if (${okCond}) set('${expVar}', String(Number(v('${expVar}')) + (${d})));`;

const journey = folder(
  '01 Customer Journey',
  [
    folder('Onboarding', [
      login(J('J02', 'login'), `set('jLogin', json() || {});`),
      req(J('J03', 'get customer'), 'GET', '/customers/{{custId}}', {
        tests: `
if (is200()) check('[A7] every field = J02', function () { pm.expect(json()).to.eql(getJ('jLogin')); });`,
      }),
      req(J('J04', 'list accounts'), 'GET', '/customers/{{custId}}/accounts', {
        tests: `
if (is200()) {
  schemaList('account');
  const list = json() || [];
  check('[A6] every account belongs to the customer', function () { list.forEach(function (a) { pm.expect(String(a.customerId)).to.eql(v('custId')); }); });
  const A = list.slice().sort(function (a, b) { return a.id - b.id; })[0];
  set('A', String(A.id)); set('jA4', A); set('expA', String(cents(A.balance)));
  set('startAccounts', ids(list));
}`,
      }),
      readA(
        'J05a',
        'account A',
        `
if (is200()) check('[A7] id, type, balance, customerId = J04 entry', function () { pm.expect(json()).to.eql(getJ('jA4')); });`,
      ),
      req(J('J05b', 'baseline transactions of A'), 'GET', '/accounts/{{A}}/transactions', {
        tests: `
if (is200()) { schemaList('transaction'); set('jBaseA', ids(json())); }`,
      }),
    ]),
    folder('Open account', [
      req(J('J06a', 'open savings account B'), 'POST', '/createAccount', {
        query: { customerId: '{{custId}}', newAccountType: 1, fromAccountId: '{{A}}' },
        tests: `
const j = json();
if (is200() && j && j.id) {
  schema('account', j);
  check('[C1] owned by the customer, type SAVINGS', function () { pm.expect([String(j.customerId), j.type]).to.eql([v('custId'), 'SAVINGS']); });
  set('B', String(j.id)); set('jBCreated', 'true'); set('jB6Response', String(cents(j.balance)));
} else { set('B', v('fallbackAccountId')); set('jBCreated', 'false'); blocked('open account', 'using fallbackAccountId as B'); }`,
      }),
      req(J('J06b', 'read-back B'), 'GET', '/accounts/{{B}}', {
        tests: `
if (is200()) {
  const b0 = cents(json().balance);
  set('B0', String(b0)); set('expB', String(b0));
  if (v('jBCreated') === 'true') {
    check('[A7] create response balance = account balance (' + v('jB6Response') + ' vs ' + b0 + ' cents)', function () { pm.expect(Number(v('jB6Response'))).to.eql(b0); });
    observe('[O1] new account funded with 100.00', b0 === 10000, { B0: b0 });
  }
}`,
      }),
      readA(
        'J06c',
        'read-back A',
        `
${addExp('expA', "v('jBCreated') === 'true' ? -Number(v('B0')) : 0", 'true')}
${expCheck('A', 'expA', '[A1]')}`,
      ),
      req(J('J06d', 'account list includes B'), 'GET', '/customers/{{custId}}/accounts', {
        tests: `
if (is200()) {
  const want = (getJ('startAccounts') || []).concat(v('jBCreated') === 'true' ? [Number(v('B'))] : []).sort(function (a, b) { return a - b; });
  check('[C1] list = start accounts + B', function () { pm.expect(ids(json())).to.eql(want); });
  set('j06dIds', ids(json()));
}`,
      }),
    ]),
    folder('Manage money', [
      req(J('J07a', 'deposit 200.00 into B'), 'POST', '/deposit', {
        query: { accountId: '{{B}}', amount: 200 },
        tests: `is200(); ${addExp('expB', 20000)}`,
      }),
      req(J('J07b', 'read-back B'), 'GET', '/accounts/{{B}}', { tests: expCheck('B', 'expB', '[A2]') }),
      req(J('J08a', 'withdraw 20.00 from B'), 'POST', '/withdraw', {
        query: { accountId: '{{B}}', amount: 20 },
        tests: `is200(); ${addExp('expB', -2000)}`,
      }),
      req(J('J08b', 'read-back B'), 'GET', '/accounts/{{B}}', { tests: expCheck('B', 'expB', '[A2]') }),
      req(J('J09a', 'transfer 50.00 B to A'), 'POST', '/transfer', {
        query: { fromAccountId: '{{B}}', toAccountId: '{{A}}', amount: 50 },
        tests: `
is200(); ${addExp('expB', -5000)} ${addExp('expA', 5000)}`,
      }),
      readA('J09b', 'read-back A', expCheck('A', 'expA', '[A1]')),
      req(J('J09b', 'read-back B'), 'GET', '/accounts/{{B}}', { tests: expCheck('B', 'expB', '[A1]') }),
    ]),
    folder('Pay bills', [
      req(J('J10a', 'pay 30.00 bill from A'), 'POST', '/billpay', {
        query: { accountId: '{{A}}', amount: 30 },
        body: payee('{{B}}'),
        tests: `
if (is200()) {
  const r = json();
  schema('billPayResult', r);
  check('[A7] payeeName, amount, accountId echoed', function () { pm.expect([r.payeeName, cents(r.amount), String(r.accountId)]).to.eql(['City Utilities', 3000, v('A')]); });
}
${addExp('expA', -3000)}`,
      }),
      readA('J10b', 'read-back A', expCheck('A', 'expA', '[A2]')),
    ]),
    folder('Statement', [
      req(J('J11a', 'transactions of A'), 'GET', '/accounts/{{A}}/transactions', {
        tests: `
if (is200()) {
  set('jFullA', json());
  const fresh = newRows(json(), getJ('jBaseA') || []);
  const want = (v('jBCreated') === 'true' ? ['Debit ' + v('B0')] : []).concat(['Credit 5000', 'Debit 3000']).sort();
  check('[A2] new rows on A = ' + JSON.stringify(want) + ' (got ' + JSON.stringify(sig(fresh)) + ')', function () { pm.expect(sig(fresh)).to.eql(want); });
  const tin = fresh.filter(function (r) { return r.type === 'Credit' && cents(r.amount) === 5000; })[0];
  set('trxIn', tin ? String(tin.id) : '0');
  set('jNewDebitsA', ids(fresh.filter(function (r) { return r.type === 'Debit'; })));
}`,
      }),
      req(J('J11b', 'transactions of B'), 'GET', '/accounts/{{B}}/transactions', {
        tests: `
if (v('jBCreated') !== 'true') blocked('B rows', 'B is the fallback account; no baseline');
else if (is200()) {
  const want = ['Credit ' + v('B0'), 'Credit 20000', 'Debit 2000', 'Debit 5000'].sort();
  check('[A2] rows on B = ' + JSON.stringify(want) + ' (got ' + JSON.stringify(sig(json())) + ')', function () { pm.expect(sig(json())).to.eql(want); });
}`,
      }),
      req(J('J11c', 'transaction by id'), 'GET', '/transactions/{{trxIn}}', {
        tests: `
if (is200()) {
  const row = (getJ('jFullA') || []).filter(function (r) { return String(r.id) === v('trxIn'); })[0];
  check('[A7] every field = the J11a row', function () { pm.expect(json()).to.eql(row); });
}`,
      }),
      req(J('J12a', 'filter amount 50'), 'GET', '/accounts/{{A}}/transactions/amount/50', {
        tests: `
if (is200()) {
  const got = subset('C2', 'jFullA', 'with amount 50.00', function (r) { return cents(r.amount) === 5000; }) || [];
  check('[C2] includes the J09 credit', function () { pm.expect(got).to.include(Number(v('trxIn'))); });
}`,
      }),
      req(J('J12b', 'filter onDate today'), 'GET', '/accounts/{{A}}/transactions/onDate/{{today}}', {
        tests: `
if (is200()) set('jOnDate', subset('C2', 'jFullA', 'dated today', function (r) { return rowDay(r) === todayIso(); }) || []);`,
      }),
      req(
        J('J12c', 'filter fromDate today toDate today'),
        'GET',
        '/accounts/{{A}}/transactions/fromDate/{{today}}/toDate/{{today}}',
        {
          tests: `
if (is200()) {
  const got = subset('C2', 'jFullA', 'dated today', function (r) { return rowDay(r) === todayIso(); });
  check('[C2] same rows as J12b', function () { pm.expect(got).to.eql(getJ('jOnDate')); });
}`,
        },
      ),
      req(
        J('J12d', 'filter month and type Debit'),
        'GET',
        '/accounts/{{A}}/transactions/month/{{monthName}}/type/Debit',
        {
          tests: `
if (is200()) {
  const got = subset('C2', 'jFullA', 'in this month with type Debit', function (r) { return rowDay(r).slice(0, 7) === todayIso().slice(0, 7) && r.type === 'Debit'; }) || [];
  check('[C2] includes the J06 and J10 debits', function () { (getJ('jNewDebitsA') || []).forEach(function (id) { pm.expect(got).to.include(id); }); });
}`,
        },
      ),
    ]),
    folder('Loan', [
      req(J('J13a', 'request loan 500, down payment 50 from A'), 'POST', '/requestLoan', {
        query: { customerId: '{{custId}}', amount: 500, downPayment: 50, fromAccountId: '{{A}}' },
        tests: `
set('L', ''); set('approved', '');
if (is200()) {
  const r = json();
  schema('loanResponse', r);
  check('[C1] approved is a boolean', function () { pm.expect(r.approved).to.be.a('boolean'); });
  set('approved', String(r.approved));
  if (r.approved) { set('L', String(r.accountId || '')); ${addExp('expA', -5000, 'true')} }
  record('[Open] approval decision', { approved: r.approved, message: r.message });
}`,
      }),
      req(J('J13b', 'account list after loan'), 'GET', '/customers/{{custId}}/accounts', {
        tests: `
if (is200()) {
  const want = (getJ('j06dIds') || []).concat(v('approved') === 'true' ? [Number(v('L'))] : []).sort(function (a, b) { return a - b; });
  check('[A12] list = J06d list' + (v('approved') === 'true' ? ' + loan account' : '') + ' (got ' + JSON.stringify(ids(json())) + ')', function () { pm.expect(ids(json())).to.eql(want); });
}`,
      }),
      readA('J13c', 'read-back A', expCheck('A', 'expA', '[A12]')),
      req(J('J13d', 'loan account (report only)'), 'GET', '/accounts/{{L}}', {
        tests: `
if (v('approved') !== 'true') blocked('loan account', 'loan not approved');
else if (code() === 200) observe('[O4] loan account is LOAN with 500.00', json().type === 'LOAN' && cents(json().balance) === 50000, { type: json().type, balance: json().balance });
else record('loan account read failed', code());`,
      }),
      req(J('J13e', 'transactions of A after loan'), 'GET', '/accounts/{{A}}/transactions', {
        tests: `
if (v('approved') !== 'true') blocked('down payment row', 'loan not approved');
else if (is200()) {
  const known = (getJ('jFullA') || []).map(function (r) { return r.id; });
  const fresh = newRows(json(), known);
  check('[A12] down payment 50.00 recorded as a Debit on A (got ' + JSON.stringify(sig(fresh)) + ')', function () { pm.expect(sig(fresh)).to.include('Debit 5000'); });
}`,
      }),
      req(J('J13e', 'transactions of the loan account'), 'GET', '/accounts/{{L}}/transactions', {
        tests: `
if (v('approved') !== 'true') blocked('loan entry', 'loan not approved');
else if (is200()) check('[A12] the loan is recorded in the loan account history (found ' + json().length + ')', function () { pm.expect(json().length).to.be.above(0); });`,
      }),
    ]),
    folder('Invest', [
      req(J('J14a', 'buy 2 QATS at 10.00'), 'POST', '/customers/{{custId}}/buyPosition', {
        query: { accountId: '{{A}}', name: 'QA Test Stock', symbol: 'QATS', shares: 2, pricePerShare: 10 },
        tests: `
set('positionId', '');
if (is200()) {
  schemaList('position');
  // newest QATS position: earlier runs may have left one behind
  const p = (json() || []).filter(function (x) { return x.symbol === 'QATS'; }).sort(function (a, b) { return b.positionId - a.positionId; })[0];
  check('[C1] position list contains QATS with 2 shares', function () { pm.expect(p && p.shares).to.eql(2); });
  if (p) { set('positionId', String(p.positionId)); ${addExp('expA', -2000, 'true')} }
} else blocked('invest', 'buyPosition failed: J14b-J15 skipped, left out of J17');`,
      }),
      req(J('J14b', 'positions of the customer'), 'GET', '/customers/{{custId}}/positions', {
        tests: `
if (!v('positionId')) blocked('positions', 'no position');
else if (is200()) check('[A7] contains the position with 2 shares', function () { const p = json().filter(function (x) { return String(x.positionId) === v('positionId'); })[0]; pm.expect(p && p.shares).to.eql(2); });`,
      }),
      req(J('J14c', 'position by id'), 'GET', '/positions/{{positionId}}', {
        tests: `
if (!v('positionId')) blocked('position', 'no position');
else if (is200()) { const p = json(); schema('position', p);
  check('[A7] shares 2, purchasePrice 10.00, owned by the customer', function () { pm.expect([p.shares, cents(p.purchasePrice), String(p.customerId)]).to.eql([2, 1000, v('custId')]); }); }`,
      }),
      readA('J14d', 'read-back A', expCheck('A', 'expA', '[A1]')),
      req(J('J15a', 'sell 1 QATS at 12.00'), 'POST', '/customers/{{custId}}/sellPosition', {
        query: { accountId: '{{A}}', positionId: '{{positionId}}', shares: 1, pricePerShare: 12 },
        tests: `
if (!v('positionId')) blocked('sell', 'no position');
else if (is200()) {
  const p = (json() || []).filter(function (x) { return String(x.positionId) === v('positionId'); })[0];
  check('[C1] position now shows 1 share', function () { pm.expect(p && p.shares).to.eql(1); });
  ${addExp('expA', 1200, 'true')}
}`,
      }),
      req(J('J15b', 'position by id'), 'GET', '/positions/{{positionId}}', {
        tests: `
if (!v('positionId')) blocked('position', 'no position');
else if (is200()) check('[A7] shares 1', function () { pm.expect(json().shares).to.eql(1); });`,
      }),
      readA('J15c', 'read-back A', expCheck('A', 'expA', '[A1]')),
    ]),
    folder('Update profile', [
      req(J('J16a', 'update street and phone'), 'POST', '/customers/update/{{custId}}', {
        query: {
          firstName: '{{firstName}}',
          lastName: '{{lastName}}',
          street: 'QA Street 1',
          city: '{{city}}',
          state: '{{state}}',
          zipCode: '{{zipCode}}',
          phoneNumber: '5550199',
          ssn: '{{ssn}}',
          username: '{{username}}',
          password: '{{password}}',
        },
        tests: `set('jUpdated', String(is200()));`,
      }),
      req(J('J16b', 'customer after update'), 'GET', '/customers/{{custId}}', {
        tests: `
if (v('jUpdated') !== 'true') blocked('profile', 'update failed');
else if (is200()) {
  const c = json(), o = getJ('jLogin') || {};
  check('[A7] new street and phone', function () { pm.expect([c.address.street, c.phoneNumber]).to.eql(['QA Street 1', '5550199']); });
  check('[A7] every other field unchanged', function () { pm.expect([c.id, c.firstName, c.lastName, c.address.city, c.address.state, c.address.zipCode, c.ssn])
    .to.eql([o.id, o.firstName, o.lastName, o.address.city, o.address.state, o.address.zipCode, o.ssn]); });
}`,
      }),
      req(J('J16c', 'login after update'), 'GET', '/login/{{username}}/{{password}}', {
        tests: `
if (is200()) check('[A7] login returns the updated profile', function () { pm.expect([json().address.street, json().phoneNumber]).to.eql(['QA Street 1', '5550199']); });`,
      }),
      req(J('J16d', 'restore original profile'), 'POST', '/customers/update/{{custId}}', {
        query: {
          firstName: '{{firstName}}',
          lastName: '{{lastName}}',
          street: '{{street}}',
          city: '{{city}}',
          state: '{{state}}',
          zipCode: '{{zipCode}}',
          phoneNumber: '{{phoneNumber}}',
          ssn: '{{ssn}}',
          username: '{{username}}',
          password: '{{password}}',
        },
        tests: `is200();`,
      }),
      req(J('J16d', 'customer after restore'), 'GET', '/customers/{{custId}}', {
        tests: `
if (is200()) check('[A7] profile = registration again', function () { pm.expect(json()).to.eql(getJ('jLogin')); });`,
      }),
    ]),
    folder('Reconciliation', [
      req(J('J17', 'final accounts'), 'GET', '/customers/{{custId}}/accounts', {
        tests: `
if (is200()) {
  const list = json();
  const want = (getJ('startAccounts') || []).concat(v('jBCreated') === 'true' ? [Number(v('B'))] : [], v('approved') === 'true' ? [Number(v('L'))] : [])
    .sort(function (a, b) { return a - b; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
  check('[A1] accounts = start + B' + (v('approved') === 'true' ? ' + L' : '') + ', nothing else', function () { pm.expect(ids(list)).to.eql(want); });
  const bal = {}; list.forEach(function (a) { bal[a.id] = cents(a.balance); });
  check('[A1] A = ledger ' + v('expA') + ' cents (got ' + bal[v('A')] + ')', function () { pm.expect(bal[v('A')]).to.eql(Number(v('expA'))); });
  check('[A2] B = ledger ' + v('expB') + ' cents (got ' + bal[v('B')] + ')', function () { pm.expect(bal[v('B')]).to.eql(Number(v('expB'))); });
  if (v('approved') === 'true') record('loan account balance (reported, not judged; Q9)', bal[v('L')]);
}
record('ids', { A: Number(v('A')), B: Number(v('B')), L: v('L') ? Number(v('L')) : null });`,
      }),
    ]),
  ],
  'JRN-01: one customer lifecycle across all endpoints (STD §5.6). Runs after the suites; non-blocking.',
);

// ---------------------------------------------------------------- collection

// The collection: collection-level pre-request script and variables, then the folders in run order.
const collection = {
  info: {
    _postman_id: 'b6f1c0de-7a1e-4c55-9d1a-parabankqa01',
    name: 'ParaBank QA',
    description:
      'Generated by tests/scripts/build-collection.mjs from STD.md. Run order: 00 Smoke (gate) -> 10 Suite fixtures + 11-19 suites -> 01 Customer Journey. Test names: <case ID> [basis] check. Basis: C# contract, A# proposed rule; observed (O#) and open items are logged as RECORD/OBSERVED lines, never asserted.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(COLLECTION_PRE) } }],
  variable: [
    'runId',
    'today',
    'monthName',
    'monthNum',
    'custId',
    'A',
    'S',
    'T',
    'B',
    'L',
    'amt',
    'snap_prev',
    'snap_cur',
  ].map((key) => ({ key, value: '' })),
  item: [
    smoke,
    journey,
    suiteLogin,
    logSuite,
    cusSuite,
    accSuite,
    trfSuite,
    depSuite,
    wdrSuite,
    bilSuite,
    lonSuite,
    trxSuite,
  ],
};

// Write the file and print how many requests and STD cases it contains.
writeFileSync(OUT, `${JSON.stringify(collection, null, 2)}\n`);
const count = (items) => items.reduce((n, i) => n + (i.item ? count(i.item) : 1), 0);
const cases = new Set();
const walk = (items) => items.forEach((i) => (i.item ? walk(i.item) : cases.add(i.name.split(' · ')[0].split(' ')[0])));
walk(collection.item);
console.log(
  `Wrote ${OUT.pathname}: ${count(collection.item)} requests, case IDs: ${[...cases]
    .filter((c) => !c.startsWith('FIX'))
    .sort()
    .join(' ')}`,
);
