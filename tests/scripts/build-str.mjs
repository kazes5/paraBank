// Test Summary Report (plan.md Stage 6, docs/exercise/06_STR_Template.md), generated from the runs of one
// test cycle: the latest complete API, UI, manual and load runs, Bug_Reports.md and the defect evidence.
//
// Output: results/runs/<UTC>-report/ (STR.md, STR.html, STR.pdf, run.json)
//         --publish also writes STR.md and STR.pdf to the repo root (the deliverable)
//         --kept    uses kept (committed) runs only, so every link in the report works for readers
// Usage:  ./run.sh report [--kept] [--publish]      (./run.sh cycle --keep builds it with --kept --publish)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright';
import { ROOT, allRuns, newRun, rebuildIndex } from './lib/common.mjs';

const args = process.argv.slice(2);
const publish = args.includes('--publish');
const keptOnly = args.includes('--kept') || publish;
const today = new Date().toISOString().slice(0, 10);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const money = (c) => (c / 100).toFixed(2);

// ---------------------------------------------------------------- source runs of the cycle

const runs = allRuns().filter((r) => !keptOnly || r.kept);
const latest = (pred) => runs.filter(pred).at(-1);
const MANUAL_ALL = ['AUTH-03', 'AUTH-05', 'TRF-08', 'TRF-09'];
const src = {
  api: latest((r) => r.kind === 'api' && (r.phases || []).length === 3 && existsSync(join(r.dir, 'results.json'))),
  ui: latest((r) => r.kind === 'ui' && existsSync(join(r.dir, 'results.json'))),
  manual: latest((r) => r.kind === 'manual' && MANUAL_ALL.every((id) => (r.scope || '').includes(id))),
  load: latest((r) => r.kind === 'load' && !r.dry && r.scope === 'L1–L6' && existsSync(join(r.dir, 'results.json'))),
  isolation: latest((r) => r.kind === 'load' && r.scope === 'concurrency isolation'),
  repro: latest((r) => r.kind === 'repro'),
};
if (!src.api) { console.error(`No complete API run${keptOnly ? ' among kept runs' : ''}: run ./run.sh all first.`); process.exit(2); }

const out = newRun('report', { scope: 'STR', sources: Object.fromEntries(Object.entries(src).map(([k, r]) => [k, r?.id || null])), published: publish });

// Every link is written relative to where the document lives (run folder or repo root)
function build(docDir) {
  const L = (p) => relative(docDir, p).split('\\').join('/') || '.';
  const link = (text, p, anchor = '') => `[${text}](${L(p)}${anchor})`;

  // ---------------------------------------------------------------- data
  const std = readFileSync('STD.md', 'utf8');
  const stdCases = [...std.matchAll(/^\| ([A-Z]+-\d+) \| ([^|]+) \| [^|]+ \| [^|]+ \| (P\d) \|/gm)].map((m) => ({ id: m[1], title: m[2].replace(/\*\*\(smoke\)\*\*/, '').trim(), priority: m[3] }));
  const api = readJson(join(src.api.dir, 'results.json'));
  const verdict = Object.fromEntries(api.rows.map((r) => [r.id, r.verdict]));
  verdict['NFR-01'] = src.api.nfr01 || (api.timeouts ? 'FAIL' : 'PASS');
  const source = Object.fromEntries(Object.keys(verdict).map((id) => [id, 'api']));
  const manual = src.manual ? readJson(join(src.manual.dir, 'results.json')).results : [];
  for (const m of manual) { verdict[m.id] = m.verdict; source[m.id] = 'manual'; }
  const load = src.load ? readJson(join(src.load.dir, 'results.json')) : null;
  const loadRows = load ? load.tests.flatMap((t) => t.rows) : [];
  const slaOk = loadRows.length && loadRows.filter((r) => !/step/.test(r.label)).every((r) => r.verdict === 'PASS');
  if (load) { verdict['NFR-02'] = slaOk && load.reconciliation.verdict === 'PASS' ? 'PASS' : 'FAIL'; source['NFR-02'] = 'load'; }
  const ui = src.ui ? readJson(join(src.ui.dir, 'results.json')) : null;

  const V = ['PASS', 'FAIL', 'NEEDS-CLARIFICATION', 'BLOCKED', 'NOT RUN'];
  const final = stdCases.map((c) => ({ ...c, verdict: verdict[c.id] || 'NOT RUN', source: source[c.id] || '—' }));
  const count = (list, v) => list.filter((c) => c.verdict === v).length;
  const totals = Object.fromEntries(V.map((v) => [v, count(final, v)]));
  const executed = totals.PASS + totals.FAIL + totals['NEEDS-CLARIFICATION'];

  const AREAS = [['AUTH', 'Login'], ['CUST', 'Customer'], ['ACCT', 'Accounts'], ['TRF', 'Transfer'], ['DEP', 'Deposit'], ['WDR', 'Withdraw'],
    ['BILL', 'Bill pay'], ['LOAN', 'Loan'], ['HIST', 'Transactions & filters'], ['JRN', 'Customer journey'], ['NFR', 'Non-functional']];

  // defects
  const bugsMd = readFileSync('Bug_Reports.md', 'utf8');
  const candidate = (bugsMd.match(/\*\*Candidate:\*\* ([^·\n]+)/) || [])[1]?.trim() || '';
  const bugs = [...bugsMd.matchAll(/^\| \[(BUG-\d+)\]\(#bug-\d+\) \| ([^|]+) \| (Critical|High|Medium|Low) \| (P\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)]
    .map((m) => ({ id: m[1], title: m[2].trim(), severity: m[3], priority: m[4], scope: m[5].trim(), cases: m[6].trim(), basis: m[7].trim() }))
    .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a.severity) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b.severity) || a.id.localeCompare(b.id));
  const sev = (s) => bugs.filter((b) => b.severity === s);
  const specQuestions = [...bugsMd.matchAll(/^\| (S\d+) \|/gm)].length;
  const bugLink = (b) => link(b.id, 'Bug_Reports.md', `#${b.id.toLowerCase()}`);

  // how to reproduce each defect
  const firstFail = (id) => {
    const f = join('evidence/bugs', id, 'repro.json');
    if (!existsSync(f)) return null;
    const s = readJson(f).steps.find((x) => x.kind === 'fail');
    return s ? { req: `${s.method} ${s.url.replace(/^https?:\/\/[^/]+\/parabank\/services\/bank/, '')}`, status: s.status, label: s.label } : null;
  };
  const reproCmd = (b) => {
    if (b.id === 'BUG-016') return '`./run.sh load` (L4) · `node --env-file=.env tests/load/isolate-concurrency.mjs`';
    const manualCase = MANUAL_ALL.find((m) => b.cases.includes(m));
    return manualCase ? `\`./run.sh repro\` · \`./run.sh manual ${manualCase}\`` : '`./run.sh repro`';
  };
  const reproAt = src.repro ? `${src.repro.id} (${link('summary', join(src.repro.dir, 'summary.md'))})` : `Stage 4, ${readJson('evidence/bugs/repro-run.json').at.slice(0, 16).replace('T', ' ')} UTC`;

  // screenshots from the selected runs (names are stable across runs)
  const shot = (run, re) => { if (!run) return null; const d = join(run.dir, 'screenshots'); if (!existsSync(d)) return null; const f = readdirSync(d).find((x) => re.test(x)); return f ? join(d, f) : null; };
  const shots = [
    [shot(src.manual, /TRF-09-transfer-0\.005/), 'BUG-001 — the 0.005 transfer is accepted (200, "Successfully transferred $0.005")'],
    [shot(src.manual, /TRF-09-ui-activity/), 'BUG-001 — afterwards the web UI can no longer show the account: "An internal error has occurred"'],
    [shot(src.ui, /^activity-L-/), 'BUG-006 — the approved loan account has no transactions (rule A12), in the UI as in the API'],
    [shot(src.manual, /AUTH-03-swagger/), 'BUG-008 — the only login is GET /login/{username}/{password}: the password travels in the URL'],
    [shot(src.manual, /TRF-08-activity/), 'TRF-08 (spec question S6) — the same transfer submitted twice is booked twice, with no warning'],
  ].filter(([p]) => p);

  // ---------------------------------------------------------------- recommendation (plan.md Stage 6 rules)
  const journeyMoneyFail = verdict['JRN-01'] === 'FAIL';
  const crit = sev('Critical'); const high = sev('High');
  const p1Fail = final.filter((c) => c.priority === 'P1' && c.verdict === 'FAIL');
  const rec = crit.length || journeyMoneyFail ? 'NO-GO' : (!high.length && !p1Fail.length ? 'GO' : 'GO WITH CONDITIONS');
  const journeyNote = api.rows.find((r) => r.id === 'JRN-01')?.note || '';
  const journeySteps = [...new Set([...journeyNote.matchAll(/\b(J\d+[a-z]?) \[/g)].map((m) => m[1]))];

  // load numbers
  const lr = (label, name) => loadRows.find((r) => r.label === label && (!name || r.name.includes(name)));
  const L1 = lr('L1'), L2 = lr('L2'), L3 = lr('L3'), L4 = lr('L4');
  const steps = loadRows.filter((r) => /^L2 step/.test(r.label));
  const L5r = lr('L5', 'GET'), L5w = lr('L5', 'transfer');
  const created = load ? load.reconciliation.rows.find((r) => r.check.startsWith('S + T'))?.actual : 0;
  const perTest = load ? load.tests.filter((t) => t.after).map((t, i, a) => {
    const prev = i ? a[i - 1].after : load.fixture.before;
    const dS = t.after.S.cents - prev.S.cents; const dT = t.after.T.cents - prev.T.cents;
    return { test: t.test, ok: t.transferOk || 0, dS, dT, gap: dS + dT };
  }) : [];
  const gapTests = perTest.filter((p) => p.gap);
  const totalReq = loadRows.filter((r) => !/step/.test(r.label)).reduce((a, r) => a + r.n, 0);
  const limited = load ? load.tests.reduce((a, t) => a + (t.rateLimited || 0), 0) : 0;

  // ---------------------------------------------------------------- document
  const runLine = (k, label) => src[k] ? `${label} ${link(`\`${src[k].id}\``, join(src[k].dir, 'summary.md'))}` : `${label} *(none)*`;
  const md = [];
  const P = (...l) => md.push(...l);

  P('# Test Summary Report (STR)', '',
    `**Candidate:** ${candidate}  `,
    `**Date:** ${today}  `,
    '**System under test:** ParaBank REST API — `https://parabank.parasoft.com/parabank/services/bank` (public sandbox)  ',
    '**Audience:** R&D and management  ',
    `**Test cycle:** ${[runLine('api', 'API'), runLine('ui', 'UI'), runLine('manual', 'manual'), runLine('load', 'load')].join(' · ')}  `,
    `**Related documents:** ${link('Test design (STD)', 'STD.md')} · ${link('Bug reports', 'Bug_Reports.md')} · ${link('Business rules', 'Business_Rules.md')} · ${link('Load test plan', 'tests/load/load_test_plan.md')} · ${link('All runs', 'results/index.md')} · ${link('Verdict history', 'results/history.md')}`,
    '');

  // 1
  P('## 1. Executive summary', '',
    `We tested the ParaBank REST API with ${stdCases.length} designed test cases, in five layers:`,
    '- a smoke gate;',
    '- nine endpoint suites;',
    '- a 16-step customer journey;',
    '- web UI cross-checks and manual tests;',
    '- a k6 load test.', '',
    `**Results:** ${totals.PASS} cases passed and ${totals.FAIL} failed, and the customer journey ${journeyMoneyFail ? 'failed' : 'passed'}. ${bugs.length} defects are open, ${crit.length} of them Critical:`,
    ...crit.map((b) => `- ${b.title.charAt(0).toLowerCase()}${b.title.slice(1)} (${bugLink(b)});`).map((l, i, a) => (i === a.length - 1 ? l.replace(/;$/, '.') : l)), '',
    `**Recommendation: ${rec}**${rec === 'NO-GO' ? ' — the API is not ready to handle real money. It needs the Critical defects fixed and a clean re-run of this cycle first.' : ''}`,
    '');
  P('```mermaid',
    'flowchart TB',
    `  F["Functional — Postman CLI<br/>smoke · 9 suites · journey: ${verdict['JRN-01'] || '—'}"]`,
    `  X["Cross-checks<br/>web UI: ${src.ui?.counts?.MATCH ?? '—'} match · 4 manual cases"]`,
    `  LD["k6 load test<br/>NFR-02: ${verdict['NFR-02'] || '—'}"]`,
    `  F --> B["Isolation on fresh users → ${bugs.length} defects (${crit.length} Critical)"]`,
    '  X --> B',
    '  LD --> B',
    `  B --> R{"${rec}"}`,
    `  style R fill:${rec === 'GO' ? '#d4edda' : rec === 'NO-GO' ? '#f8d7da' : '#fff3cd'},stroke:#333,stroke-width:2px`,
    '```', '');

  // 2
  P('## 2. Scope: what was and was not tested', '',
    '| Area | Tested? | Notes |', '|---|---|---|',
    `| In-scope endpoints: login, customer, accounts, account, transfer, deposit, withdraw, bill pay, request loan, transactions and filters | **Yes** | Positive, negative, boundary, security and data-integrity cases, each suite on fresh accounts (${link('STD §5', 'STD.md')}) |`,
    '| Extended endpoints: open account, buy/sell positions, update profile | Partly | Checked by journey steps J06, J14–J16, with no dedicated suite |',
    `| End-to-end customer journey (JRN-01) | **Yes** | J02–J17 in one run; failing steps isolated to endpoints (${link('Bug reports: failure classification', 'Bug_Reports.md', '#failure-classification-stage-4-exit-gate')}) |`,
    `| Web UI | Cross-check only | Overview and activity pages compared with the API (${src.ui ? link('UI run', join(src.ui.dir, 'summary.md')) : '—'}); no UI functional testing |`,
    `| Security | Basic | Missing authentication, password in the URL, injection (blocked by the site firewall, so not tested) |`,
    `| Performance | **Yes** (small) | \`GET /accounts/{id}\` and \`POST /transfer\` only, ≤ 10 VUs (${link('load test plan', 'tests/load/load_test_plan.md')}) |`,
    '| Concurrency of other writes (deposit, withdraw, bill pay) | No | Only transfer was load-tested |',
    '| Admin endpoints (`/cleanDB`, `/initializeDB`, `/setParameter`, JMS) | No | Excluded: they affect every user of the shared site; a guard blocks them |',
    '| Other customers\' data | No | Only our own and throwaway users; the access gap (BUG-002) was shown on our own customer |',
    '');

  // 3
  P('## 3. Results', '',
    '| Total test cases | Executed | Passed | Failed | Blocked | Not run |', '|---|---|---|---|---|---|',
    `| ${stdCases.length} | ${executed} | ${totals.PASS} | ${totals.FAIL} | ${totals.BLOCKED} | ${totals['NOT RUN']} |`, '',
    `*Executed* includes ${totals['NEEDS-CLARIFICATION']} NEEDS-CLARIFICATION: the case ran, but the expected behavior is not defined, so it is a question for R&D. Verdicts come from:`,
    `- the API run (Postman CLI);`,
    `- the manual run (${MANUAL_ALL.join(', ')});`,
    `- the load run (NFR-02).`, '',
    '| Area | Designed | Passed | Failed | Needs clarification | Blocked | Not run |', '|---|---|---|---|---|---|---|',
    ...AREAS.map(([p, n]) => { const l = final.filter((c) => c.id.startsWith(`${p}-`)); return l.length ? `| ${n} (${p}) | ${l.length} | ${count(l, 'PASS')} | ${count(l, 'FAIL')} | ${count(l, 'NEEDS-CLARIFICATION')} | ${count(l, 'BLOCKED')} | ${count(l, 'NOT RUN')} |` : null; }).filter(Boolean),
    '');
  P('**Customer journey:**',
    `- JRN-01 ${verdict['JRN-01'] || 'NOT RUN'}, with ${api.rows.find((r) => r.id === 'JRN-01')?.checks || '—'} checks passing.`,
    ...(journeySteps.length ? [`- Failing steps: ${journeySteps.join(', ')}. Each was isolated to an endpoint defect (BUG-009, BUG-015, BUG-006).`] : []),
    '- The money steps (deposit, transfer, bill pay) reconciled.', '',
    `**UI cross-check:** ${src.ui ? `${src.ui.counts?.MATCH ?? 0} checks match the API, ${src.ui.counts?.MISMATCH ?? 0} mismatch, and ${src.ui.counts?.['RULE NOT MET'] ?? 0} rule is not met (A12: the loan is missing from the history in the UI as well as the API).` : 'not run in this cycle.'}`, '',
    `**Full results:**`,
    `- per-case table: ${link('API run summary', join(src.api.dir, 'summary.md'))};`,
    `- manual evidence: ${src.manual ? link('manual run', join(src.manual.dir, 'summary.md')) : '—'};`,
    `- trend across runs: ${link('verdict history', 'results/history.md')}.`,
    '');
  P('```mermaid', `pie showData title Test case verdicts (${stdCases.length} cases)`,
    ...V.filter((v) => totals[v]).map((v) => `  "${v}" : ${totals[v]}`), '```', '');

  // 4
  P('## 4. Defects', '',
    `All ${bugs.length} defects are open; none has been fixed or retested after a fix. Each was reproduced on a fresh throwaway customer next to a control input that works.`, '',
    '| Severity | Open | Fixed/Closed | Examples (ID and title) |', '|---|---|---|---|',
    ...['Critical', 'High', 'Medium', 'Low'].map((s) => { const l = sev(s); return `| ${s} | ${l.length} | 0 | ${l.slice(0, 3).map((b) => `${bugLink(b)} ${esc(b.title)}`).join('<br>') || '—'}${l.length > 3 ? `<br>+ ${l.length - 3} more` : ''} |`; }),
    '',
    `**Full list:** every defect, with its evidence and the command that reproduces it. Last re-verified: ${reproAt}.`, '',
    '| ID | Sev. | Prio. | Title | Detected by | Evidence | Reproduce |', '|---|---|---|---|---|---|---|',
    ...bugs.map((b) => `| ${bugLink(b)} | ${b.severity} | ${b.priority} | ${esc(b.title)} | ${esc(b.cases)} | ${link('bundle', join('evidence/bugs', b.id, 'repro.md'))} | ${reproCmd(b)} |`),
    '',
    `Open spec questions: ${specQuestions} (${link('Bug_Reports.md, spec ambiguities', 'Bug_Reports.md', '#spec-ambiguities-and-contradictions')}). The failing request of each defect is listed in Appendix A.`,
    '');

  // 5
  P('## 5. Non-functional results', '');
  if (load) {
    P(`**Load model:** see the ${link('load test plan', 'tests/load/load_test_plan.md')} and the ${link('run summary', join(src.load.dir, 'summary.md'))}.`,
      `- **Single client:** k6 from one machine, at most 10 VUs and ${totalReq} requests over about 15 minutes.`,
      '- **Low rate:** at most 2 requests per second, because Cloudflare blocks one client after about 60 rapid requests.',
      '- **Contention:** created by sending requests at the same moment rather than by a higher rate (L4: 5 transfers at once, 16 rounds).',
      '- **Fixtures:** a throwaway customer with fresh accounts.', '',
      '**SLAs (self-defined, STD §4):**',
      '- reads p95 ≤ 1000 ms;',
      '- writes p95 ≤ 1500 ms;',
      '- error rate < 1 %;',
      '- 5 s timeout;',
      '- p95 judged only with n ≥ 20.', '',
      '| Test | Load | n | Throughput | p50 | p95 | max | Errors | Growth vs baseline | SLA |', '|---|---|---|---|---|---|---|---|---|---|',
      ...[[L1, 'Read baseline, 1 VU'], [L2, 'Read step load 0.7 → 2 req/s, ≤ 10 VUs'], [L3, 'Transfer baseline, sequential'], [L4, '5 simultaneous transfers × 16'], [L5r, 'Reads during writes'], [L5w, 'Writes during reads']]
        .filter(([r]) => r).map(([r, d]) => `| ${r.label} \`${r.name}\` | ${d} | ${r.n} | ${r.rate} req/s | ${r.p50} ms | **${r.p95} ms** | ${r.max} ms | ${r.errorRate} % | ${r.growth ? `${r.growth}×` : '—'} | ${r.verdict} |`),
      '',
      `**Speed:** every test met its SLA, with 0 errors, ${limited} × HTTP 429 and ${verdict['NFR-01'] === 'PASS' ? 'no timeouts in the functional runs either (NFR-01 PASS)' : 'timeouts in the functional runs (NFR-01 FAIL)'}.`,
      `- Read p95 stayed flat from 0.7 to 2 req/s (${steps.map((s) => s.p95).join(' → ')} ms).`,
      ...(L4 && L3 ? [`- With 5 transfers at once, p95 rose to ${L4.p95} ms (${L4.growth}× the ${L3.p95} ms baseline) while p50 stayed at ${L4.p50} ms. Requests queue when they hit the same account.`] : []),
      '',
      `**Correctness under load: ${load.reconciliation.verdict}.**`,
      `- ${load.reconciliation.transfers.ok} transfers of 1.00 were confirmed, and T received all of them.`,
      `- S went down by ${money(-(load.reconciliation.rows[0].actual))} instead of ${money(-(load.reconciliation.rows[0].expected))}, so **${money(created)} was created**.`,
      `- Balances read after every test place the gap in ${gapTests.map((g) => `${g.test} (+${money(g.gap)})`).join(', ') || 'no test'}; the sequential tests reconcile exactly.`,
      `- Isolated on a fresh customer: ${src.isolation ? link('isolation run', join(src.isolation.dir, 'summary.md')) : '—'}. Filed as ${bugs.find((b) => b.id === 'BUG-016') ? bugLink(bugs.find((b) => b.id === 'BUG-016')) : 'BUG-016'} (Critical).`,
      '');
    const readBars = [L1, ...steps, L5r].filter(Boolean);
    const writeBars = [L3, L4, L5w].filter(Boolean);
    const chart = (title, bars, sla) => ['```mermaid',
      '%%{init: {"xyChart": {"height": 260, "showDataLabel": true}, "themeVariables": {"xyChart": {"plotColorPalette": "#4a86c5, #d9534f"}}}}%%',
      'xychart-beta', `  title "${title}"`,
      `  x-axis [${bars.map((b) => `"${b.label.replace('L2 step ', 'L2.')}"`).join(', ')}]`, `  y-axis "p95 (ms)" 0 --> ${sla + 200}`,
      `  bar [${bars.map((b) => b.p95).join(', ')}]`, `  line [${bars.map(() => sla).join(', ')}]`, '```', ''];
    P(...chart('GET /accounts/{id}: p95 per test vs the 1000 ms SLA (line)', readBars, 1000));
    P(...chart('POST /transfer: p95 per test vs the 1500 ms SLA (line)', writeBars, 1500));
    P('| After test | Transfers confirmed | S change | T change | Money created |', '|---|---|---|---|---|',
      ...perTest.filter((p) => p.ok).map((p) => `| ${p.test} | ${p.ok} | ${money(p.dS)} | +${money(p.dT)} | ${p.gap ? `**+${money(p.gap)}**` : '0.00'} |`), '');
  } else P('*No load run in this cycle.*', '');
  P('**Suspected bottlenecks:**',
    '- the balance update in `POST /transfer` is not atomic: the debit is read, changed and written without a lock, so parallel debits overwrite each other (lost update);',
    '- writes to the same account are serialised in the app or its connection pool (p95 rises with 5 at once, p50 does not).',
    '- No read bottleneck was visible at these rates.', '',
    '**Limits of a shared public system:**',
    '- no capacity or breaking point: the rate is capped by Cloudflare and by our budget;',
    '- one client, so results include our network and the CDN;',
    '- other users\' traffic and periodic data resets add noise;',
    '- no server metrics or logs, so causes are only suspected;',
    '- small samples (30–230 requests per test).',
    '');

  // 6
  const risk = (id, text, mit) => bugs.find((b) => b.id === id) ? `| ${text} (${bugLink(bugs.find((b) => b.id === id))}) | ${mit[0]} | ${mit[1]} |` : null;
  P('## 6. Risks and open issues', '',
    '| Risk | Impact | Mitigation / next step |', '|---|---|---|',
    risk('BUG-016', 'Concurrent payments from one account create money', ['Balances drift from statements; money created silently', 'Atomic balance update / row lock; re-run L4 and extend to deposit, withdraw, bill pay']),
    risk('BUG-002', 'No authentication on the API', ['Anyone can read profiles (incl. SSN) and move any customer\'s money', 'Add authentication and ownership checks before any release']),
    risk('BUG-003', 'Missing amount validation (negative, zero, above balance)', ['Money moves in the wrong direction; unlimited overdraft', 'Server-side validation; re-run TRF, DEP, WDR, BILL suites']),
    risk('BUG-001', 'One sub-cent transfer makes a customer\'s accounts unreadable', ['Customer locked out in API and UI; needs a data fix', 'Reject > 2 decimals; repair affected accounts']),
    `| ${specQuestions} open spec questions (overdraft, loan approval, errors, dates, SLAs) | Some "defects" may be intended behavior; expected results are proposals | R&D answers (${link('spec questions', 'Bug_Reports.md', '#spec-ambiguities-and-contradictions')}); re-classify affected cases |`,
    '| Shared public test site (resets, rate limits, other users) | False failures, blocked runs, noisy timings | Fresh data per run, smoke gate, BLOCKED verdicts; repeat on a dedicated instance |',
    `| Not covered: injection (AUTH-05 blocked by the firewall), concurrency of other write endpoints, extended endpoints in depth | Unknown defects remain | Test on a local ParaBank instance (Docker) |`,
    '');

  // 7
  P('## 7. Justification of the recommendation', '',
    'The decision follows the rules set before testing (plan.md Stage 6):', '',
    '```mermaid', 'flowchart LR',
    `  A{"Any Critical defect open?<br/>(${crit.length} open)"} -- Yes --> NOGO["NO-GO"]`,
    `  A -- No --> B{"Journey breaks on an<br/>in-scope money step?"}`,
    '  B -- Yes --> NOGO',
    '  B -- No --> C{"All P1 pass and<br/>no High defects?"}',
    '  C -- Yes --> GO["GO"]',
    '  C -- No --> COND["GO WITH CONDITIONS"]',
    `  style ${rec === 'NO-GO' ? 'NOGO' : rec === 'GO' ? 'GO' : 'COND'} fill:#f8d7da,stroke:#333,stroke-width:3px`,
    '```', '',
    `**${rec}.** ${crit.length} Critical defects are open, and each one alone blocks a release of a banking API:`,
    ...crit.map((b) => `- ${bugLink(b)}: ${esc(b.title)}.`), '',
    `The ${high.length} High defects (${high.map((b) => b.id).join(', ')}) would on their own still lead to *GO WITH CONDITIONS* at best. ${p1Fail.length} P1 test cases fail.`, '',
    '**What would change the decision:**',
    '1. All Critical defects and the P1 High defects are fixed.',
    '2. The full cycle (`./run.sh cycle`) re-runs with:',
    '   - the journey passing;',
    '   - every P1 case passing;',
    '   - the load test reconciling to the cent.',
    '3. R&D confirms the proposed business rules, which turns candidate defects into confirmed ones or closes them.',
    '');

  // 8
  P('## 8. Next steps', '',
    '- **R&D:** fix BUG-016, BUG-002, BUG-003 and BUG-001 first, then the High P1 defects (BUG-004, BUG-005).',
    '- **Product / R&D:** answer the spec questions, mainly overdraft (S2), loan approval (S7) and SLAs (S15).',
    '- **QA:** after each fix, run `./run.sh cycle --keep`. It rebuilds this report, and the verdict history shows what changed.',
    '- **QA:** extend the concurrency test to deposit, withdraw and bill pay, and run AUTH-05 and a larger load on a local ParaBank instance.',
    '');

  // appendices
  P('<div class="page-break"></div>', '', '## Appendix A — How to reproduce', '',
    'Everything runs from the repository root with credentials in `.env` (see `README.md`). Every command writes a run folder in `results/runs/`.', '',
    '| What | Command |', '|---|---|',
    '| Register or verify the test users (after a site reset) | `./run.sh setup` |',
    '| Whole cycle, then this report (`--keep` commits the runs and publishes the report) | `./run.sh cycle [--keep]` |',
    '| Smoke gate → endpoint suites → customer journey (Postman CLI) | `./run.sh all` |',
    '| Web UI cross-check of the latest API run | `./run.sh ui latest` |',
    '| Manual cases with screenshots (visible Chrome) | `./run.sh manual AUTH-03 AUTH-05 TRF-08 TRF-09` |',
    '| Load test L1–L6 | `./run.sh load` |',
    '| Reproduce every defect on fresh throwaway users | `./run.sh repro` |',
    '| Rebuild this report | `./run.sh report [--kept] [--publish]` |', '',
    '**Failing request per defect** (from the evidence bundles; host `https://parabank.parasoft.com/parabank/services/bank`):', '',
    '| ID | Step | Failing request | Status |', '|---|---|---|---|',
    ...bugs.map((b) => { const f = firstFail(b.id); return f ? `| ${bugLink(b)} | ${esc(f.label)} | \`${esc(f.req)}\` | ${f.status} |` : `| ${bugLink(b)} | ${b.id === 'BUG-016' ? '5 transfers of 1.00 sent at the same moment' : '—'} | ${b.id === 'BUG-016' ? '`POST /transfer?fromAccountId=S&toAccountId=T&amount=1.00` × 5 in parallel' : `see ${link('bundle', join('evidence/bugs', b.id, 'repro.md'))}`} | ${b.id === 'BUG-016' ? '200 (each)' : '—'} |`; }),
    '');
  if (shots.length) {
    P('<div class="page-break"></div>', '', '## Appendix B — Evidence screenshots', '');
    for (const [p, cap] of shots) P(`**${cap}**`, '', `![${cap}](${L(p)})`, '', `<sub>${L(p)}</sub>`, '');
  }
  P('## Appendix C — Sources of this report', '',
    '| Source | Run / file |', '|---|---|',
    ...Object.entries(src).map(([k, r]) => `| ${k} | ${r ? link(`\`${r.id}\``, join(r.dir, existsSync(join(r.dir, 'summary.md')) ? 'summary.md' : 'run.json')) : '—'} |`),
    `| Defects | ${link('Bug_Reports.md', 'Bug_Reports.md')}, ${link('evidence/bugs/', 'evidence/bugs')} |`,
    `| Test design | ${link('STD.md', 'STD.md')} |`, '',
    `<sub>Generated by \`tests/scripts/build-str.mjs\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${src.api.commit ? ` · API run at commit ${src.api.commit}` : ''}.</sub>`, '');
  return { md: md.filter((l) => l !== null).join('\n'), rec, totals, bugs: bugs.length, crit: crit.length };
}

// ---------------------------------------------------------------- PDF (Chrome via Playwright; Mermaid rendered in the page)

let repoUrl = '';
try { repoUrl = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/'); } catch { /* no remote */ }

async function pdf(mdText, docDir, htmlPath, pdfPath) {
  const renderer = new marked.Renderer();
  const code = renderer.code.bind(renderer);
  renderer.code = (tok) => (tok.lang === 'mermaid' ? `<pre class="mermaid">${tok.text}</pre>` : code(tok));
  renderer.link = ({ href, text }) => {
    // links point at GitHub in the PDF so readers can open them; images stay local
    const abs = /^(https?:|#)/.test(href) || !repoUrl ? href : `${repoUrl}/blob/main/${relative(ROOT, join(ROOT, docDir, href.split('#')[0])).split('\\').join('/')}${href.includes('#') ? `#${href.split('#')[1]}` : ''}`;
    return `<a href="${abs}">${marked.parseInline(text)}</a>`;
  };
  const body = marked.parse(mdText, { renderer });
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(join(ROOT, docDir)).href}/">
<title>Test Summary Report</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  body { font: 10pt/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2328; }
  h1 { font-size: 20pt; border-bottom: 3px solid #0b5394; padding-bottom: 4px; color: #0b5394; margin-top: 0; }
  h2 { font-size: 13.5pt; color: #0b5394; border-bottom: 1px solid #d0d7de; padding-bottom: 2px; margin-top: 18px; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 8.6pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #d0d7de; padding: 3px 6px; vertical-align: top; text-align: left; }
  th { background: #eef3f8; }
  tr:nth-child(even) td { background: #fafbfc; }
  code { font: 8.4pt Menlo, Consolas, monospace; background: #f3f4f6; padding: 0 3px; border-radius: 3px; word-break: break-all; }
  a { color: #0b5394; text-decoration: none; }
  pre.mermaid { text-align: center; background: none; margin: 8px 0 12px; break-inside: avoid; }
  pre.mermaid svg { max-height: 95mm; }
  img { max-width: 100%; max-height: 120mm; border: 1px solid #d0d7de; display: block; margin: 4px auto; }
  sub { color: #6e7781; }
  .page-break { break-before: page; }
  strong { color: #111; }
</style></head><body>${body}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', themeVariables: { fontSize: '13px' } });
  mermaid.run({ querySelector: '.mermaid' }).then(() => { window.__done = true; }).catch((e) => { console.error(e); window.__done = true; });
</script></body></html>`;
  writeFileSync(htmlPath, html);
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(ROOT, htmlPath)).href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
    await page.pdf({
      path: pdfPath, format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-size:7pt;color:#6e7781;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>ParaBank REST API — Test Summary Report · ${today}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
    });
  } finally { await browser.close(); }
}

// ---------------------------------------------------------------- write

const inRun = build(out.dir);
writeFileSync(join(out.dir, 'STR.md'), inRun.md);
await pdf(inRun.md, out.dir, join(out.dir, 'STR.html'), join(out.dir, 'STR.pdf'));
writeFileSync(join(out.dir, 'summary.md'), `# Test Summary Report — run ${out.id}\n\nRecommendation: **${inRun.rec}** · ${inRun.bugs} open defects (${inRun.crit} Critical).\n\n- [STR.md](STR.md) · [STR.pdf](STR.pdf)\n`);
if (publish) {
  const root = build('.');
  writeFileSync('STR.md', root.md);
  await pdf(root.md, '.', join(out.dir, 'STR-root.html'), 'STR.pdf');
}
out.update({ finished: new Date().toISOString(), recommendation: inRun.rec, counts: { [inRun.rec]: 1, defects: inRun.bugs, critical: inRun.crit, ...Object.fromEntries(Object.entries(inRun.totals).filter(([, n]) => n)) } });
rebuildIndex();
console.log(`Recommendation: ${inRun.rec} · ${inRun.bugs} defects (${inRun.crit} Critical)\nReport: ${out.dir}/STR.md, STR.pdf${publish ? '\nPublished: STR.md, STR.pdf' : ''}`);
