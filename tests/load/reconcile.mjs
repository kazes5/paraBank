// Load-test analysis (load_test_plan.md §4 L6 and §6): statistics per test and step from k6's raw
// JSON output, SLA verdicts, balance reconciliation, and summary.md / results.json in the run folder.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// p95 targets per endpoint in ms (NFR, load_test_plan.md §2), and a nearest-rank percentile.
const SLA = { 'GET /accounts/{id}': 1000, 'POST /transfer': 1500 };
const pct = (a, q) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]);
};

// Reads one k6 --out json file into plain arrays
export function readRaw(file) {
  const r = {
    req: [],
    errors: [],
    checks: [],
    rateLimited: 0,
    transferOk: 0,
    transferUnsure: 0,
    firstAt: null,
    lastAt: null,
  };
  if (!existsSync(file)) return r;
  // Each line is one JSON metric sample; keep only data points ("Point") and sort them by metric:
  // request durations (with endpoint, step, status, time), error flags, checks and the custom counters.
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"type":"Point"')) continue;
    const p = JSON.parse(line);
    if (p.type !== 'Point') continue;
    const t = p.data.tags || {};
    const v = p.data.value;
    const at = Date.parse(p.data.time);
    switch (p.metric) {
      case 'http_req_duration':
        r.req.push({ ms: v, name: t.name, step: Number(t.step || 1), status: Number(t.status || 0), at });
        r.firstAt ??= at;
        r.lastAt = at;
        break;
      case 'errors':
        r.errors.push(v);
        break;
      case 'checks':
        r.checks.push({ check: t.check, ok: v === 1 });
        break;
      case 'rate_limited':
        r.rateLimited += v;
        break;
      case 'transfer_ok':
        r.transferOk += v;
        break;
      case 'transfer_unsure':
        r.transferUnsure += v;
        break;
    }
  }
  return r;
}

// Statistics for a set of requests. 429 responses are left out of the timings (they are the CDN,
// not the API) and reported separately; status 0 = timeout.
function stats(reqs) {
  const ok = reqs.filter((x) => x.status !== 429);
  const ms = ok.map((x) => x.ms);
  const secs = ok.length > 1 ? (ok.at(-1).at - ok[0].at) / 1000 : 0;
  return {
    n: ok.length,
    rate: secs ? +(ok.length / secs).toFixed(2) : null,
    p50: pct(ms, 0.5),
    p90: pct(ms, 0.9),
    p95: pct(ms, 0.95),
    max: ms.length ? Math.round(Math.max(...ms)) : null,
    httpErrors: ok.filter((x) => x.status !== 200).length,
    timeouts: ok.filter((x) => x.status === 0).length,
    limited: reqs.length - ok.length,
  };
}

// One row per test (and per step for L2 and L4), with an SLA verdict where n ≥ 20
export function analyse(test, raw, baseline) {
  const rows = [];
  const names = [...new Set(raw.req.map((x) => x.name))];
  for (const name of names) {
    const reqs = raw.req.filter((x) => x.name === name);
    // L2 also gets one row per load step, so the p95 growth from step to step is visible.
    const groups =
      test === 'L2'
        ? [...new Set(reqs.map((x) => x.step))]
            .sort()
            .map((s) => [`${test} step ${s}`, reqs.filter((x) => x.step === s)])
        : [];
    for (const [label, rs] of [[test, reqs], ...groups]) {
      const st = stats(rs);
      const checks = raw.checks;
      const failedChecks = checks.filter((c) => !c.ok).length;
      const errRate =
        label === test && raw.errors.length
          ? raw.errors.filter(Boolean).length / raw.errors.length
          : st.httpErrors / Math.max(1, st.n);
      const target = SLA[name];
      // Verdict: PASS when p95 meets the target and errors < 1 %; fewer than 20 requests is too few to judge.
      let verdict;
      if (st.n < 20) verdict = st.limited ? 'BLOCKED (429)' : 'info (n < 20)';
      else verdict = st.p95 <= target && errRate < 0.01 ? 'PASS' : 'FAIL';
      const base = baseline?.[name];
      rows.push({
        label,
        name,
        ...st,
        errorRate: +(errRate * 100).toFixed(2),
        failedChecks: label === test ? failedChecks : null,
        target,
        verdict,
        growth: base && st.p95 ? +(st.p95 / base).toFixed(2) : null,
      });
    }
  }
  return rows;
}

// L6 reconciliation: S must drop and T must rise by exactly the confirmed transfers × 1.00, the total
// must not change, and each side gains one transaction per transfer. "Unsure" transfers (timeouts / 5xx)
// allow a tolerance, except for the total: money may never be created or destroyed.
export function reconcile(before, after, transfers) {
  const { ok, unsure } = transfers;
  const dS = after.S.cents - before.S.cents;
  const dT = after.T.cents - before.T.cents;
  const rows = [
    { check: 'S decreased by successful transfers × 1.00', expected: -ok * 100, actual: dS },
    { check: 'T increased by successful transfers × 1.00', expected: ok * 100, actual: dT },
    { check: 'S + T unchanged', expected: 0, actual: dS + dT },
    { check: 'S transactions added', expected: ok, actual: after.S.transactions - before.S.transactions },
    { check: 'T transactions added', expected: ok, actual: after.T.transactions - before.T.transactions },
  ].map((r) => ({
    ...r,
    result:
      r.actual === r.expected
        ? 'MATCH'
        : unsure &&
            Math.abs(r.actual - r.expected) <= unsure * (r.check.includes('transactions') ? 1 : 100) &&
            r.check !== 'S + T unchanged'
          ? 'MATCH (within unsure)'
          : 'MISMATCH',
  }));
  return { rows, verdict: rows.every((r) => r.result.startsWith('MATCH')) ? 'PASS' : 'FAIL' };
}

// Cents → "12.34" for the tables.
const money = (c) => (c / 100).toFixed(2);

// Writes the run's summary.md (results per test, run details, balances after each test, L6 checks, notes)
// and results.json (everything except the raw samples); returns the Markdown lines for the console.
export function writeSummary(dir, { runId, fixture, results, recon, smokeAfter, notes }) {
  const all = results.flatMap((r) => r.rows);
  const md = [
    `# Load test — run ${runId}`,
    '',
    `Plan: \`tests/load/load_test_plan.md\` · customer \`${fixture.username}\` (throwaway, ${fixture.customerId}) · S ${fixture.S} → T ${fixture.T} · k6 from one client, latency = \`http_req_duration\` (client side, includes network and Cloudflare).`,
    '',
    '## Results per test',
    '',
    'p95 verdict only where n ≥ 20. Growth = p95 / baseline p95 (L1 for reads, L3 for transfers). Errors = HTTP errors, timeouts and failed body checks (429 counted separately).',
    '',
    '| Test | Endpoint | n | Rate (req/s) | p50 | p90 | p95 | max | Errors % | Timeouts | 429 | p95 target | Growth | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...all.map(
      (r) =>
        `| ${r.label} | \`${r.name}\` | ${r.n} | ${r.rate ?? '—'} | ${r.p50 ?? '—'} | ${r.p90 ?? '—'} | ${r.p95 ?? '—'} | ${r.max ?? '—'} | ${r.errorRate} | ${r.timeouts} | ${r.limited} | ${r.target} | ${r.growth ?? '—'} | **${r.verdict}** |`,
    ),
    '',
    '| Test | k6 exit | Stopped by a stop rule | Transfers confirmed | Transfers unsure | Failed checks |',
    '|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.test} | ${r.exit ?? 'skipped'} | ${r.exit === 99 ? 'yes' : r.exit === undefined ? '—' : 'no'} | ${r.raw?.transferOk ?? 0} | ${r.raw?.transferUnsure ?? 0} | ${r.failed || '—'} |`,
    ),
    '',
    // Per-test balance changes: a gap points at the test that lost or created money.
    '## Balances after each test',
    '',
    'Each test should move S by −(confirmed transfers) and T by +(confirmed transfers). A gap here shows which test lost or created money.',
    '',
    '| After | S | T | Transfers confirmed | S change | T change | Gap (S + T change) |',
    '|---|---|---|---|---|---|---|',
    ...results
      .filter((r) => r.after)
      .map((r, i, arr) => {
        const prev = i ? arr[i - 1].after : fixture.before;
        const dS = r.after.S.cents - prev.S.cents;
        const dT = r.after.T.cents - prev.T.cents;
        return `| ${r.test} | ${money(r.after.S.cents)} | ${money(r.after.T.cents)} | ${r.raw?.transferOk ?? 0} | ${money(dS)} | ${money(dT)} | ${dS + dT ? `**${money(dS + dT)}**` : '0.00'} |`;
      }),
    '',
    '## L6 — reconciliation and after-load checks',
    '',
    `Before: S ${money(fixture.before.S.cents)} (${fixture.before.S.transactions} trx), T ${money(fixture.before.T.cents)} (${fixture.before.T.transactions} trx) · After: S ${money(recon.after.S.cents)} (${recon.after.S.transactions} trx), T ${money(recon.after.T.cents)} (${recon.after.T.transactions} trx)`,
    '',
    '| Check | Expected | Actual | Result |',
    '|---|---|---|---|',
    ...recon.rows.map(
      (r) =>
        `| ${r.check} | ${r.check.includes('transactions') ? r.expected : money(r.expected)} | ${r.check.includes('transactions') ? r.actual : money(r.actual)} | **${r.result}** |`,
    ),
    '',
    `Reconciliation: **${recon.verdict}** · smoke after load: **${smokeAfter}**`,
    '',
    ...(notes.length ? ['## Notes', '', ...notes.map((n) => `- ${n}`), ''] : []),
  ];
  writeFileSync(join(dir, 'summary.md'), md.join('\n'));
  writeFileSync(
    join(dir, 'results.json'),
    `${JSON.stringify({ fixture, tests: results.map(({ raw, ...r }) => ({ ...r, transferOk: raw?.transferOk, transferUnsure: raw?.transferUnsure, rateLimited: raw?.rateLimited })), reconciliation: recon, smokeAfter, notes }, null, 2)}\n`,
  );
  return md;
}
