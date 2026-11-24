// Load-test fixture (load_test_plan.md §3): a throwaway customer with fresh accounts S and T,
// S funded with 500.00, and a snapshot of balances and transaction counts.
// The password is never written anywhere; the API needs only account IDs.

import { http, registerThrowaway, cents } from '../scripts/lib/common.mjs';

export async function snapshot(fx) {
  const out = {};
  for (const [k, id] of [['S', fx.S], ['T', fx.T]]) {
    const acc = await http('GET', `/accounts/${id}`);
    const trx = await http('GET', `/accounts/${id}/transactions`);
    if (acc.status !== 200 || trx.status !== 200) throw new Error(`Snapshot of ${k} ${id} failed: HTTP ${acc.status}/${trx.status}`);
    out[k] = { balance: acc.json.balance, cents: cents(acc.json.balance), transactions: trx.json.length };
  }
  return { at: new Date().toISOString(), ...out };
}

export async function setupFixture() {
  const u = await registerThrowaway('qa_load');
  const open = async () => {
    const r = await http('POST', '/createAccount', { query: { customerId: u.customerId, newAccountType: 0, fromAccountId: u.A } });
    if (r.status !== 200 || !r.json?.id) throw new Error(`createAccount failed: HTTP ${r.status}`);
    return r.json.id;
  };
  const S = await open();
  const T = await open();
  const dep = await http('POST', '/deposit', { query: { accountId: S, amount: 500 } });
  if (dep.status !== 200) throw new Error(`deposit failed: HTTP ${dep.status}`);
  const fx = { username: u.username, customerId: u.customerId, A: u.A, S, T };
  fx.before = await snapshot(fx);
  return fx;
}
