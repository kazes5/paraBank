// Shared k6 helpers for the load tests (tests/load/load_test_plan.md).
// Every request: 5 s timeout, Accept JSON, tagged with the test ID (L1…L5) and step.
// HTTP 429 (Cloudflare rate limit) is counted separately and aborts the scenario (plan §5);
// it never counts as an SLA error.

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

export const API = `${__ENV.BASE_URL || 'https://parabank.parasoft.com/parabank'}/services/bank`;
export const TEST = __ENV.TEST || 'dev';
export const S = __ENV.S;
export const T = __ENV.T;

export const errors = new Rate('errors');               // HTTP error, timeout or failed body check (excl. 429)
export const rateLimited = new Counter('rate_limited'); // HTTP 429 from Cloudflare
export const transferOk = new Counter('transfer_ok');   // transfers confirmed by the body text
export const transferUnsure = new Counter('transfer_unsure'); // timeout / 5xx: may or may not have moved money

// Stop rules (plan §5): any 429, > 10 % errors after the start, p95 > 5 s
export const safety = {
  rate_limited: [{ threshold: 'count<1', abortOnFail: true }],
  errors: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '15s' }],
  http_req_duration: [{ threshold: 'p(95)<5000', abortOnFail: true, delayAbortEval: '15s' }],
};

const params = (name, step) => ({
  headers: { Accept: 'application/json' },
  timeout: '5s',
  tags: { name, test: TEST, step: String(step) },
});

// Returns true when the request was rate-limited (the caller skips its checks)
function limited(res) {
  if (res.status !== 429) return false;
  rateLimited.add(1);
  return true;
}

export function getAccount(id, step = 1, extra = {}) {
  const res = http.get(`${API}/accounts/${id}`, params('GET /accounts/{id}', step));
  if (limited(res)) return null;
  let body = null;
  try { body = res.json(); } catch (_) { /* not JSON */ }
  const ok = check(res, {
    'GET status 200': (r) => r.status === 200,
    'GET id matches': () => body !== null && String(body.id) === String(id),
    'GET balance is a number': () => body !== null && typeof body.balance === 'number',
    'GET type CHECKING': () => body !== null && body.type === 'CHECKING',
    ...Object.fromEntries(Object.entries(extra).map(([k, f]) => [k, () => f(body)])),
  }, { test: TEST, step: String(step) });
  errors.add(!ok, { test: TEST });
  return body;
}

export function transfer(from, to, step = 1) {
  const url = `${API}/transfer?fromAccountId=${from}&toAccountId=${to}&amount=1.00`;
  const res = http.post(url, null, params('POST /transfer', step));
  if (limited(res)) return false;
  const expected = `Successfully transferred $1.00 from account #${from} to account #${to}`;
  const ok = check(res, {
    'transfer status 200': (r) => r.status === 200,
    'transfer success text': (r) => typeof r.body === 'string' && r.body.includes(expected),
  }, { test: TEST, step: String(step) });
  errors.add(!ok, { test: TEST });
  if (ok) transferOk.add(1, { test: TEST });
  else if (res.status === 0 || res.status >= 500) transferUnsure.add(1, { test: TEST });
  return ok;
}
