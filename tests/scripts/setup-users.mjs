// Stage 0 setup (plan.md): for every test user in .env
//   1. API login; if it fails, register the user through the web UI form (HTTP POST to register.htm)
//   2. Exit gate: API login returns a customer whose profile matches the .env registration data
//   3. Note the default account; ensure a fallback CHECKING account exists for the endpoint suites
//   4. Write the captured IDs back to .env (<PREFIX>_CUSTOMER_ID, <PREFIX>_DEFAULT_ACCOUNT_ID, <PREFIX>_FALLBACK_ACCOUNT_ID)
//
// Users are read from .env by prefix: PARABANK_* and PARABANK2_*.
// Only usernames, IDs and outcomes are printed; passwords and SSNs never are.
//
// Usage: ./run.sh setup   (node --env-file=.env tests/scripts/setup-users.mjs)

import { readFileSync, writeFileSync } from 'node:fs';

// The two .env users, the admin endpoints that must never be called, and the target site.
const PREFIXES = ['PARABANK', 'PARABANK2'];
const FORBIDDEN = /cleanDB|initializeDB|setParameter|JmsListener/i;
const web = process.env.BASE_URL; // https://parabank.parasoft.com/parabank
const api = `${web}/services/bank`;
const ENV_FILE = new URL('../../.env', import.meta.url);

// One paced API call (this script predates lib/common.mjs and keeps its own minimal client).
async function call(method, path, { query, headers } = {}) {
  const url = new URL(api + path);
  if (FORBIDDEN.test(url.pathname)) throw new Error(`Forbidden endpoint: ${url.pathname}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, { method, headers: { Accept: 'application/json', ...headers } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* error bodies are plain text */
  }
  return { status: res.status, json, text };
}

// API login with URL-encoded credentials.
const login = (u) => call('GET', `/login/${encodeURIComponent(u.username)}/${encodeURIComponent(u.password)}`);

// Registers the user through the public web form, exactly as a person would (GET for the session cookie,
// then POST the form). Success = the page says the account was created.
async function register(u) {
  const page = await fetch(`${web}/register.htm`);
  const cookie = (page.headers.get('set-cookie') || '').split(';')[0];
  const form = new URLSearchParams({
    'customer.firstName': u.firstName,
    'customer.lastName': u.lastName,
    'customer.address.street': u.street,
    'customer.address.city': u.city,
    'customer.address.state': u.state,
    'customer.address.zipCode': u.zip,
    'customer.phoneNumber': u.phone,
    'customer.ssn': u.ssn,
    'customer.username': u.username,
    'customer.password': u.password,
    repeatedPassword: u.password,
  });
  const res = await fetch(`${web}/register.htm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: form,
  });
  const html = await res.text();
  if (/created successfully/i.test(html)) return;
  if (/already exists/i.test(html)) {
    throw new Error(
      `"${u.username}" already exists but login failed: password in .env is wrong, or pick a new username`,
    );
  }
  const errors = [...html.matchAll(/<span[^>]*class="error"[^>]*>([^<]+)</g)].map((m) => m[1]);
  throw new Error(`Registration failed: ${errors.join('; ') || `HTTP ${res.status}, unexpected page`}`);
}

// One user from .env by prefix; null if the prefix is not configured (PARABANK2 is optional).
function readUser(prefix) {
  const e = (k) => process.env[`${prefix}_${k}`];
  const u = {
    prefix,
    username: e('USERNAME'),
    password: e('PASSWORD'),
    ssn: e('SSN'),
    firstName: e('FIRST_NAME'),
    lastName: e('LAST_NAME'),
    street: e('STREET'),
    city: e('CITY'),
    state: e('STATE'),
    zip: e('ZIP'),
    phone: e('PHONE'),
  };
  const missing = Object.entries(u)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return missing.length ? null : u;
}

// Fields where the profile returned by the API differs from the .env registration data.
function profileMismatches(u, c) {
  const checks = {
    firstName: [c.firstName, u.firstName],
    lastName: [c.lastName, u.lastName],
    street: [c.address?.street, u.street],
    city: [c.address?.city, u.city],
    state: [c.address?.state, u.state],
    zipCode: [c.address?.zipCode, u.zip],
    phoneNumber: [c.phoneNumber, u.phone],
    ssn: [c.ssn, u.ssn],
  };
  return Object.entries(checks)
    .filter(([, [a, b]]) => a !== b)
    .map(([k]) => k);
}

// Writes KEY=value lines into .env, replacing existing keys and appending new ones.
function setEnvVars(vars) {
  let text = readFileSync(ENV_FILE, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  writeFileSync(ENV_FILE, text);
}

// Full setup of one user (steps 1-4 in the header). Throws on any failed step.
async function setupUser(u) {
  console.log(`\n== ${u.username} (${u.prefix}_*)`);

  // 1. login, else register
  let res = await login(u);
  if (res.status === 200 && res.json?.id) {
    console.log('  login: OK (user already exists)');
  } else {
    console.log(`  login: HTTP ${res.status} "${res.text.slice(0, 60)}" -> registering via web form`);
    await register(u);
    res = await login(u);
    if (!(res.status === 200 && res.json?.id)) throw new Error(`Login after registration failed: HTTP ${res.status}`);
    console.log('  registered; login: OK');
  }

  // 2. exit gate: profile matches registration data
  const customer = res.json;
  const bad = profileMismatches(u, customer);
  if (bad.length) throw new Error(`Exit gate FAILED: returned profile differs from .env in: ${bad.join(', ')}`);
  console.log(`  exit gate: PASS (customerId ${customer.id}, profile matches .env)`);

  // 3. accounts: default + fallback
  const accRes = await call('GET', `/customers/${customer.id}/accounts`);
  if (accRes.status !== 200 || !Array.isArray(accRes.json))
    throw new Error(`Accounts lookup failed: HTTP ${accRes.status}`);
  let accounts = accRes.json;
  const byId = [...accounts].sort((a, b) => a.id - b.id);
  const defaultAcc = byId[0];
  console.log(`  default account: ${defaultAcc.id} ${defaultAcc.type} balance ${defaultAcc.balance}`);

  let fallback = byId.find((a) => a.id !== defaultAcc.id && a.type === 'CHECKING');
  if (fallback) {
    console.log(`  fallback account: ${fallback.id} (already exists)`);
  } else {
    // Same service the web UI "Open New Account" page calls; newAccountType 0 = CHECKING
    const created = await call('POST', '/createAccount', {
      query: { customerId: customer.id, newAccountType: 0, fromAccountId: defaultAcc.id },
    });
    if (created.status !== 200 || !created.json?.id)
      throw new Error(`Opening fallback account failed: HTTP ${created.status} ${created.text.slice(0, 80)}`);
    fallback = created.json;
    console.log(`  fallback account: ${fallback.id} CHECKING opened, balance ${fallback.balance}`);
  }

  // re-read balances after opening the account (setup snapshot)
  accounts = (await call('GET', `/customers/${customer.id}/accounts`)).json;
  for (const a of accounts) console.log(`  snapshot: account ${a.id} ${a.type} balance ${a.balance}`);

  setEnvVars({
    [`${u.prefix}_CUSTOMER_ID`]: customer.id,
    [`${u.prefix}_DEFAULT_ACCOUNT_ID`]: defaultAcc.id,
    [`${u.prefix}_FALLBACK_ACCOUNT_ID`]: fallback.id,
  });
  return {
    username: u.username,
    customerId: customer.id,
    defaultAccountId: defaultAcc.id,
    fallbackAccountId: fallback.id,
  };
}

// Main: set up every configured user, print a table of IDs, exit 1 if any user failed.
const users = PREFIXES.map(readUser).filter(Boolean);
if (!users.length) {
  console.error('No complete user found in .env (expected PARABANK_* and/or PARABANK2_* fields)');
  process.exit(2);
}

const results = [];
let failed = false;
for (const u of users) {
  try {
    results.push(await setupUser(u));
  } catch (err) {
    failed = true;
    console.error(`  ERROR: ${err.message}`);
  }
}
console.log(`\nRun at ${new Date().toISOString()}`);
console.table(results);
process.exit(failed ? 1 : 0);
