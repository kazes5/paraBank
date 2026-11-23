// Turns the redacted Stage 3 logs of one run into per-case verdicts (STD.md header) and the
// NFR-01 response-time report (STD.md §4 SLA model).
//
// Verdict per case:
//   FAIL                 any failed check. [C#] = defect; [A#] = candidate defect (rule needs R&D confirmation)
//   NEEDS-CLARIFICATION  no failed check, but an observation changed (O#) or the case only records behavior (Open)
//   BLOCKED              smoke gate failed, or the case's checks could not run
//   PASS                 every check passed
//
// Usage: node scripts/summarize-stage3.mjs evidence/stage3/<runId>

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/summarize-stage3.mjs evidence/stage3/<runId>'); process.exit(2); }

// Case titles and priorities from the STD tables
const std = {};
for (const line of readFileSync('STD.md', 'utf8').split('\n')) {
  const m = line.match(/^\| ([A-Z]+-\d+) \| ([^|]+) \| [^|]+ \| [^|]+ \| (P\d) \|/);
  if (m) std[m[1]] = { title: m[2].replace(/\*\*\(smoke\)\*\*/, '').trim(), priority: m[3] };
}

const cases = {};
const caseOf = (label) => label.split(' ')[0];
const get = (id) => (cases[id] ??= { pass: 0, fail: [], blocked: [], records: [], changed: [], same: [] });
const requests = [];
const phasesRun = [];

for (const phase of ['smoke', 'suites', 'journey']) {
  const file = join(dir, `${phase}.log`);
  if (!existsSync(file)) continue;
  phasesRun.push(phase);
  const lines = readFileSync(file, 'utf8').split('\n');
  let console = '';
  const flush = () => {
    for (const m of console.matchAll(/\{"kind":"(RECORD|BLOCKED|OBSERVED-SAME|OBSERVED-CHANGED)","case":"([^"]+)","label":"((?:[^"\\]|\\.)*)"/g)) {
      const c = get(caseOf(m[2]));
      const entry = `${m[2].split(' ')[1] && m[2].startsWith('JRN') ? `${m[2].split(' ')[1]} ` : ''}${m[3]}`;
      ({ RECORD: c.records, BLOCKED: c.blocked, 'OBSERVED-SAME': c.same, 'OBSERVED-CHANGED': c.changed })[m[1]].push(entry);
    }
    console = '';
  };
  for (const line of lines) {
    if (line.startsWith('  | ')) { console += line.slice(4); continue; }
    if (console) flush();
    let m;
    if ((m = line.match(/^ {2}Pass {2}(\S+) (.*)$/))) { if (!m[1].startsWith('FIX')) get(m[1]).pass++; continue; }
    if ((m = line.match(/^ +\d+\. (\S+) (.*)$/))) {
      const rest = m[2];
      const id = m[1];
      if (id.startsWith('FIX')) { get('FIX').fail.push(rest); continue; }
      get(id).fail.push(rest.replace(/^(J\d+[a-z]?) /, '$1 '));
      continue;
    }
    if ((m = line.match(/^ {2}(GET|POST) (.+?) \[(\d+|[A-Z]+)[^,]*, [^,]+, (\d+) ms\]/))) {
      requests.push({ phase, method: m[1], url: m[2], status: m[3], ms: Number(m[4]) });
    }
  }
  if (console) flush();
}

// ---------------------------------------------------------------- verdicts

const smokeFailed = phasesRun.includes('smoke') && ['AUTH-01', 'CUST-01', 'ACCT-01', 'ACCT-02', 'DEP-01'].some((id) => cases[id]?.fail.length);
const verdict = (c) => {
  if (c.fail.length) return 'FAIL';
  if (c.changed.length) return 'NEEDS-CLARIFICATION';
  if (c.records.some((r) => r.includes('[Open] behavior'))) return 'NEEDS-CLARIFICATION'; // expected result is Open only
  if (!c.pass && c.records.some((r) => r.includes('[Open]'))) return 'NEEDS-CLARIFICATION';
  if (!c.pass && c.blocked.length) return 'BLOCKED';
  return 'PASS';
};
const basisOf = (c) => {
  const tags = [...new Set(c.fail.flatMap((f) => f.match(/\[(C\d+|A\d+)\]/g) || []))];
  if (!tags.length) return '';
  return tags.some((t) => t.startsWith('[C')) ? `defect ${tags.join(' ')}` : `candidate defect ${tags.join(' ')}`;
};

const MANUAL = { 'AUTH-03': 'Manual: design issue, noted once', 'AUTH-05': 'Manual: the site firewall blocks it first', 'TRF-08': 'Manual: exploratory', 'TRF-09': 'Manual: breaks accounts (reproduced in Stage 1, E1)', 'NFR-02': 'Stage 5 (k6)' };
const order = Object.keys(std);
const rows = order.map((id) => {
  if (id === 'NFR-01') return null; // reported below
  const c = cases[id];
  if (!c) return { id, verdict: MANUAL[id] ? 'NOT RUN' : smokeFailed ? 'BLOCKED' : 'NOT RUN', note: MANUAL[id] || '' };
  const v = smokeFailed && !['AUTH-01', 'CUST-01', 'ACCT-01', 'ACCT-02', 'DEP-01', 'HIST-01'].includes(id) ? 'BLOCKED' : verdict(c);
  const notes = [basisOf(c), ...c.fail.map((f) => f.replace(/\s+/g, ' ')), ...c.changed.map((x) => `observation changed: ${x}`),
    ...(v !== 'FAIL' ? c.records.filter((r) => r.includes('[Open]')).map((r) => `recorded: ${r}`) : []),
    ...c.blocked.map((b) => `partly blocked: ${b}`)].filter(Boolean);
  return { id, verdict: v, checks: `${c.pass}/${c.pass + c.fail.length}`, note: notes.join('; ') };
}).filter(Boolean);

// ---------------------------------------------------------------- NFR-01

const norm = (u) => {
  let p = u.replace(/.*services\/bank/, '').split('?')[0];
  p = p.replace(/\/login\/[^/]+\/[^/]+/, '/login/{u}/{p}').replace(/\/(amount|onDate)\/[^/]+/, '/$1/{x}')
    .replace(/\/fromDate\/[^/]+\/toDate\/[^/]+/, '/fromDate/{f}/toDate/{t}').replace(/\/month\/[^/]+\/type\/[^/]+/, '/month/{m}/type/{t}')
    .replace(/\/(-?\d+|abc)(?=\/|$)/g, '/{id}');
  return p;
};
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const groups = {};
for (const r of requests) (groups[`${r.method} ${norm(r.url)}`] ??= []).push(r);
const nfr = Object.entries(groups).sort().map(([k, rs]) => {
  const ms = rs.map((r) => r.ms);
  const cls = k.startsWith('GET') ? 'Read' : 'Write';
  const target = cls === 'Write' ? 1500 : 1000;
  const p95 = pct(ms, 0.95);
  const verdict = ms.length >= 20 ? (p95 <= target ? 'PASS' : 'FAIL') : 'info (n < 20)';
  return { endpoint: k, cls, n: ms.length, p50: pct(ms, 0.5), p95, max: Math.max(...ms), target, outliers: ms.filter((x) => x > target).length, verdict };
});
const timeouts = requests.filter((r) => r.ms > 5000 || !/^\d+$/.test(r.status)).length;
const allMs = requests.map((r) => r.ms);

// ---------------------------------------------------------------- write

const count = (v) => rows.filter((r) => r.verdict === v).length;
const esc = (s) => String(s).replace(/\|/g, '\\|');
const md = [
  `# Stage 3 results — run ${dir.split('/').pop()}`,
  '',
  `Phases run: ${phasesRun.join(' → ')} · smoke gate: ${smokeFailed ? '**FAILED** (everything else BLOCKED)' : 'passed'} · requests: ${requests.length}`,
  '',
  `| Verdict | Cases |`, `|---|---|`,
  ...['PASS', 'FAIL', 'NEEDS-CLARIFICATION', 'BLOCKED', 'NOT RUN'].map((v) => `| ${v} | ${count(v)} |`),
  '',
  'Checks = passed / total assertions for the case. Basis: [C#] contract → defect; [A#] proposed rule → candidate defect (needs R&D confirmation, STD §6).',
  '',
  '| ID | Title | Priority | Verdict | Checks | Notes |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${esc(std[r.id]?.title || '')} | ${std[r.id]?.priority || ''} | **${r.verdict}** | ${r.checks || '—'} | ${esc(r.note || '')} |`),
  ...(cases.FIX?.fail.length ? ['', `Fixture problems: ${cases.FIX.fail.join('; ')}`] : []),
  '',
  '## NFR-01 — response times in this run (SLA model, STD §4)',
  '',
  `All requests: n ${allMs.length}, p50 ${pct(allMs, 0.5)} ms, p95 ${pct(allMs, 0.95)} ms, max ${Math.max(...allMs)} ms. Timeouts (> 5 s) or no response: **${timeouts}** → NFR-01 ${timeouts ? '**FAIL**' : '**PASS**'} (no p95 verdict where n < 20).`,
  '',
  '| Endpoint | Class | n | p50 | p95 | max | p95 target | Over target | Verdict |', '|---|---|---|---|---|---|---|---|---|',
  ...nfr.map((x) => `| \`${x.endpoint}\` | ${x.cls} | ${x.n} | ${x.p50} | ${x.p95} | ${x.max} | ${x.target} | ${x.outliers} | ${x.verdict} |`),
  '',
];
writeFileSync(join(dir, 'results.md'), md.join('\n'));
writeFileSync(join(dir, 'results.json'), `${JSON.stringify({ smokeFailed, rows, nfr, timeouts, cases }, null, 2)}\n`);
console.log(md.slice(0, 12).join('\n'));
console.log(`-> ${join(dir, 'results.md')}`);
