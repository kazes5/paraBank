// Turns the redacted logs of one API run into per-case verdicts (STD.md header) and the
// NFR-01 response-time report (STD.md §4 SLA model); then rebuilds results/index.md and history.md.
//
// Verdict per case:
//   FAIL                 any failed check. [C#] = defect; [A#] = candidate defect (rule needs R&D confirmation)
//   NEEDS-CLARIFICATION  no failed check, but an observation changed (O#) or the case only records behavior (Open)
//   BLOCKED              smoke gate failed, or the case's checks could not run
//   PASS                 every check passed
//
// Called by run-api.mjs. Re-summarize an existing run: node tests/scripts/summarize.mjs results/runs/<runId>

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { rebuildIndex, redact } from './lib/common.mjs';

export function summarize(dir) {
  // Case titles and priorities from the STD tables
  const std = {};
  for (const line of readFileSync('deliverables/STD.md', 'utf8').split('\n')) {
    const m = line.match(/^\| ([A-Z]+-\d+) \| ([^|]+) \| [^|]+ \| [^|]+ \| (P\d) \|/);
    if (m) std[m[1]] = { title: m[2].replace(/\*\*\(smoke\)\*\*/, '').trim(), priority: m[3] };
  }

  // Per-case tally while parsing: passed checks, failures, blocked steps, records and observations.
  // requests = every request line with its time (for NFR-01); accounts = IDs the run logged (for the UI cross-check).
  const cases = {};
  const caseOf = (label) => label.split(' ')[0];
  const get = (id) =>
    (cases[id] ??= { pass: 0, fail: [], smokeFail: [], blocked: [], records: [], changed: [], same: [] });
  const requests = [];
  const accounts = {};
  const phasesRun = [];

  for (const phase of ['smoke', 'suites', 'journey']) {
    const file = [join(dir, 'logs', `${phase}.log`), join(dir, `${phase}.log`)].find((f) => existsSync(f));
    if (!file) continue;
    phasesRun.push(phase);
    const lines = readFileSync(file, 'utf8').split('\n');
    // The Postman CLI wraps each console.log over several "  | " lines: collect them, then flush() parses
    // the structured records ({"kind":...}) once the block ends.
    let console = '';
    const flush = () => {
      for (const m of console.matchAll(
        /\{"kind":"RECORD","case":"(JRN-01 J17|FIX-TRF)","label":"(ids|fixture)","detail":(\{[^}]*\})/g,
      )) {
        try {
          Object.assign(accounts, JSON.parse(m[3]));
        } catch {
          /* wrapped oddly */
        }
      }
      for (const m of console.matchAll(
        /\{"kind":"(RECORD|BLOCKED|OBSERVED-SAME|OBSERVED-CHANGED)","case":"([^"]+)","label":"((?:[^"\\]|\\.)*)"(?:,"detail":"((?:[^"\\]|\\.)*)")?/g,
      )) {
        const c = get(caseOf(m[2]));
        // BLOCKED entries keep their reason (the string detail), e.g. "fixture: createAccount failed (500)".
        const label = m[1] === 'BLOCKED' && m[4] ? `${m[3]}: ${m[4]}` : m[3];
        const entry = `${m[2].split(' ')[1] && m[2].startsWith('JRN') ? `${m[2].split(' ')[1]} ` : ''}${label}`;
        ({ RECORD: c.records, BLOCKED: c.blocked, 'OBSERVED-SAME': c.same, 'OBSERVED-CHANGED': c.changed })[m[1]].push(
          entry,
        );
      }
      console = '';
    };
    // Line types in the CLI log: console output, "Pass <case> ..." checks, numbered failures,
    // and request lines "GET url [status, size, ms]".
    for (const line of lines) {
      if (line.startsWith('  | ')) {
        console += line.slice(4);
        continue;
      }
      if (console) flush();
      let m;
      if ((m = line.match(/^ {2}Pass {2}(\S+) (.*)$/))) {
        if (!m[1].startsWith('FIX')) get(m[1]).pass++;
        continue;
      }
      if ((m = line.match(/^ +\d+\. (\S+) (.*)$/))) {
        const rest = m[2];
        const id = m[1];
        if (id.startsWith('FIX')) {
          get(id).fail.push(rest); // FIX (shared fixtures) or FIX-<suite>
          continue;
        }
        get(id).fail.push(rest.replace(/^(J\d+[a-z]?) /, '$1 '));
        if (phase === 'smoke') get(id).smokeFail.push(rest); // the smoke gate counts only smoke-phase failures
        continue;
      }
      if ((m = line.match(/^ {2}(GET|POST) (.+?) \[(\d+|[A-Z]+)[^,]*, [^,]+, (\d+) ms\]/))) {
        requests.push({ phase, method: m[1], url: m[2], status: m[3], ms: Number(m[4]) });
      }
    }
    if (console) flush();
  }

  // ---------------------------------------------------------------- verdicts

  // Smoke failed = one of the smoke cases has a failure; then every other case is BLOCKED.
  const SMOKE = ['AUTH-01', 'CUST-01', 'ACCT-01', 'ACCT-02', 'DEP-01', 'HIST-01'];
  const smokeFailed = phasesRun.includes('smoke') && SMOKE.some((id) => cases[id]?.smokeFail.length);
  // A suite whose own fixture failed (deposit, opening S/T, or the fixture snapshot) ran on fallback
  // accounts with unknown balance and history, so its cases are BLOCKED, never PASS or FAIL.
  // Smoke cases are excluded: their smoke checks do not depend on the suite fixture.
  const SUITE_OF = { TRF: 'TRF-', DEP: 'DEP-', WDR: 'WDR-', BIL: 'BILL-', LON: 'LOAN-', TRX: 'HIST-' };
  const fixtureFailed = {};
  for (const [tag, prefix] of Object.entries(SUITE_OF)) {
    const f = cases[`FIX-${tag}`];
    if (f && (f.fail.length || f.blocked.length)) fixtureFailed[prefix] = [...f.blocked, ...f.fail].join('; ');
  }
  const blockedByFixture = (id) =>
    SMOKE.includes(id) ? null : Object.entries(fixtureFailed).find(([p]) => id.startsWith(p))?.[1];
  const verdict = (c) => {
    if (c.fail.length) return 'FAIL';
    if (c.changed.length) return 'NEEDS-CLARIFICATION';
    if (c.records.some((r) => r.includes('[Open] behavior'))) return 'NEEDS-CLARIFICATION'; // expected result is Open only
    if (!c.pass && c.records.some((r) => r.includes('[Open]'))) return 'NEEDS-CLARIFICATION';
    if (!c.pass && c.blocked.length) return 'BLOCKED';
    return 'PASS';
  };
  // Why a case failed: [C#] rules = confirmed defect, [A#] rules only = candidate defect.
  const basisOf = (c) => {
    const tags = [...new Set(c.fail.flatMap((f) => f.match(/\[(C\d+|A\d+)\]/g) || []))];
    if (!tags.length) return '';
    return tags.some((t) => t.startsWith('[C')) ? `defect ${tags.join(' ')}` : `candidate defect ${tags.join(' ')}`;
  };

  const MANUAL = {
    'AUTH-03': 'Manual: design issue, noted once',
    'AUTH-05': 'Manual: the site firewall blocks it first',
    'TRF-08': 'Manual: exploratory',
    'TRF-09': 'Manual: breaks accounts (reproduced in Stage 1, E1)',
    'NFR-02': 'Stage 5 (k6)',
  };
  // One row per STD case, in STD order. Manual cases are NOT RUN here (they have their own run kind).
  const order = Object.keys(std);
  const rows = order
    .map((id) => {
      if (id === 'NFR-01') return null; // reported below
      const c = cases[id];
      if (!c)
        return { id, verdict: MANUAL[id] ? 'NOT RUN' : smokeFailed ? 'BLOCKED' : 'NOT RUN', note: MANUAL[id] || '' };
      const fixtureWhy = blockedByFixture(id);
      const v = (smokeFailed && !SMOKE.includes(id)) || fixtureWhy ? 'BLOCKED' : verdict(c);
      const notes = [
        fixtureWhy ? `suite fixture failed (${fixtureWhy}): results not valid` : '',
        basisOf(c),
        ...c.fail.map((f) => f.replace(/\s+/g, ' ')),
        ...c.changed.map((x) => `observation changed: ${x}`),
        ...(v !== 'FAIL' ? c.records.filter((r) => r.includes('[Open]')).map((r) => `recorded: ${r}`) : []),
        ...c.blocked.map((b) => `partly blocked: ${b}`),
      ].filter(Boolean);
      return { id, verdict: v, checks: `${c.pass}/${c.pass + c.fail.length}`, note: notes.join('; ') };
    })
    .filter(Boolean);

  // ---------------------------------------------------------------- NFR-01

  // NFR-01: group requests by endpoint pattern (IDs, dates, credentials → placeholders),
  // then p50 / p95 / max per endpoint against the 1000 ms read / 1500 ms write targets.
  const norm = (u) => {
    let p = u.replace(/.*services\/bank/, '').split('?')[0];
    p = p
      .replace(/\/login\/[^/]+\/[^/]+/, '/login/{u}/{p}')
      .replace(/\/(amount|onDate)\/[^/]+/, '/$1/{x}')
      .replace(/\/fromDate\/[^/]+\/toDate\/[^/]+/, '/fromDate/{f}/toDate/{t}')
      .replace(/\/month\/[^/]+\/type\/[^/]+/, '/month/{m}/type/{t}')
      .replace(/\/(-?\d+|abc)(?=\/|$)/g, '/{id}');
    return p;
  };
  const pct = (a, q) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
  };
  const groups = {};
  for (const r of requests) (groups[`${r.method} ${norm(r.url)}`] ??= []).push(r);
  const nfr = Object.entries(groups)
    .sort()
    .map(([k, rs]) => {
      const ms = rs.map((r) => r.ms);
      const cls = k.startsWith('GET') ? 'Read' : 'Write';
      const target = cls === 'Write' ? 1500 : 1000;
      const p95 = pct(ms, 0.95);
      const verdict = ms.length >= 20 ? (p95 <= target ? 'PASS' : 'FAIL') : 'info (n < 20)';
      return {
        endpoint: k,
        cls,
        n: ms.length,
        p50: pct(ms, 0.5),
        p95,
        max: Math.max(...ms),
        target,
        outliers: ms.filter((x) => x > target).length,
        verdict,
      };
    });
  // Requests over the 5 s timeout or without an HTTP status.
  const timeouts = requests.filter((r) => r.ms > 5000 || !/^\d+$/.test(r.status)).length;
  const allMs = requests.map((r) => r.ms);
  // NFR-01 (STD §4): FAIL on any timeout, or on any endpoint with n ≥ 20 whose p95 is over its target.
  const nfrFailing = nfr.filter((x) => x.verdict === 'FAIL').map((x) => x.endpoint);
  const nfr01 = timeouts || nfrFailing.length ? 'FAIL' : 'PASS';
  const fixtureProblems = Object.entries(cases)
    .filter(([id]) => id.startsWith('FIX'))
    .flatMap(([id, c]) => [...c.fail, ...c.blocked].map((x) => `${id}: ${x}`));

  // ---------------------------------------------------------------- write

  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const md = [
    `# API test results — run ${basename(dir)}`,
    '',
    `Phases run: ${phasesRun.join(' → ')} · smoke gate: ${smokeFailed ? '**FAILED** (everything else BLOCKED)' : 'passed'} · requests: ${requests.length}`,
    '',
    `| Verdict | Cases |`,
    `|---|---|`,
    ...['PASS', 'FAIL', 'NEEDS-CLARIFICATION', 'BLOCKED', 'NOT RUN'].map((v) => `| ${v} | ${count(v)} |`),
    '',
    'Checks = passed / total assertions for the case. Basis: [C#] contract → defect; [A#] proposed rule → candidate defect (needs R&D confirmation, STD §6).',
    '',
    '| ID | Title | Priority | Verdict | Checks | Notes |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${esc(std[r.id]?.title || '')} | ${std[r.id]?.priority || ''} | **${r.verdict}** | ${r.checks || '—'} | ${esc(r.note || '')} |`,
    ),
    ...(fixtureProblems.length ? ['', `Fixture problems: ${fixtureProblems.join('; ')}`] : []),
    '',
    '## NFR-01 — response times in this run (SLA model, STD §4)',
    '',
    `All requests: n ${allMs.length}, p50 ${pct(allMs, 0.5)} ms, p95 ${pct(allMs, 0.95)} ms, max ${Math.max(...allMs)} ms. Timeouts (> 5 s) or no response: **${timeouts}** · endpoints over their p95 target (n ≥ 20): **${nfrFailing.length ? nfrFailing.join(', ') : 'none'}** → NFR-01 **${nfr01}** (no p95 verdict where n < 20).`,
    '',
    '| Endpoint | Class | n | p50 | p95 | max | p95 target | Over target | Verdict |',
    '|---|---|---|---|---|---|---|---|---|',
    ...nfr.map(
      (x) =>
        `| \`${x.endpoint}\` | ${x.cls} | ${x.n} | ${x.p50} | ${x.p95} | ${x.max} | ${x.target} | ${x.outliers} | ${x.verdict} |`,
    ),
    '',
  ];

  // Write summary.md and results.json, add counts and account IDs to run.json, refresh the index.
  const counts = Object.fromEntries(
    ['PASS', 'FAIL', 'NEEDS-CLARIFICATION', 'BLOCKED', 'NOT RUN'].map((v) => [v, count(v)]),
  );
  // Notes are rebuilt from joined log lines, so they are redacted again before writing.
  writeFileSync(join(dir, 'summary.md'), redact(md.join('\n')));
  writeFileSync(
    join(dir, 'results.json'),
    redact(`${JSON.stringify({ smokeFailed, rows, nfr, nfr01, timeouts, cases }, null, 2)}\n`),
  );
  const runFile = join(dir, 'run.json');
  const run = existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')) : {};
  writeFileSync(
    runFile,
    `${JSON.stringify({ ...run, counts, smokeFailed, accounts: { ...(run.accounts || {}), ...accounts }, nfr01, requests: requests.length }, null, 2)}\n`,
  );
  rebuildIndex();
  console.log(md.slice(0, 12).join('\n'));
  console.log(`-> ${join(dir, 'summary.md')}`);
  return { counts, rows };
}

// Command-line use: re-summarize an existing run folder.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) {
    console.error('Usage: node tests/scripts/summarize.mjs results/runs/<runId>');
    process.exit(2);
  }
  summarize(process.argv[2]);
}
