// Refreshes every run-specific fact in the documents from the latest *kept* runs, so the deliverables
// always describe the latest test cycle without hand copying:
//
//   1. evidence/bugs/BUG-016/ (load-reconciliation.json, isolation.json, repro.md) from the latest load
//      and isolation runs — the other bundles are written by ./run.sh repro --publish;
//   2. every marked block in the documents below:  <!-- auto:NAME -->…<!-- /auto:NAME -->
//      (inline or multi-line). The text between the markers is replaced; everything else is hand-written
//      and left alone. Unknown names fail the run, so a typo can't silently freeze a value.
//
// Only kept runs are used (they are committed, so every link works for a reviewer). With --since T only
// runs started at or after T count; a block whose run is missing keeps its text and is reported.
//
// Usage: node tests/scripts/update-docs.mjs [--since <ISO>] [--check]
//        --check  report what would change, write nothing (exit 1 if a document is out of date)
// Called by ./run.sh cycle --keep and by ./run.sh report --publish (before the STR is built).

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allRuns, RUN_TYPES, API, redact } from './lib/common.mjs';
import { CASES } from './lib/failures.mjs';

// Documents that may hold markers (repo-relative).
export const DOCS = [
  'SUBMISSION.md',
  'README.md',
  'plan.md',
  'docs/walkthrough.md',
  'deliverables/README.md',
  'deliverables/Bug_Reports.md',
  'deliverables/STD.md',
  'deliverables/load_test_plan.md',
];

const money = (cents) => (cents / 100).toFixed(2);
const signed = (cents) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const hhmm = (iso, secs = false) => String(iso).slice(11, secs ? 19 : 16);
const day = (iso) => String(iso).slice(0, 10);
const path = (url) => String(url).replace(API, '/parabank/services/bank');
const rel = (doc, p) => relative(dirname(doc), p).split('\\').join('/') || '.';

// ---------------------------------------------------------------- inputs

function loadInputs(since) {
  const runs = allRuns().filter((r) => r.kept && (!since || Date.parse(r.started || 0) >= Date.parse(since)));
  const latest = Object.fromEntries(RUN_TYPES.map((t) => [t.key, runs.filter(t.test).at(-1) || null]));
  // The evidence bundles name no run, so the reproduction run is the one whose time window contains
  // the bundles' own timestamps (the newest repro run may have failed without publishing).
  const stamp = readdirSync('evidence/bugs')
    .map((d) => join('evidence/bugs', d, 'repro.json'))
    .filter((f) => existsSync(f))
    .flatMap((f) => readJson(f).steps.map((st) => st.at))
    .filter(Boolean)
    .sort()[0];
  latest.repro =
    (stamp &&
      allRuns()
        .filter((r) => r.kept && r.kind === 'repro')
        .find(
          (r) => Date.parse(r.started) <= Date.parse(stamp) && Date.parse(stamp) <= Date.parse(r.finished || stamp),
        )) ||
    null;
  const results = (r) => (r && existsSync(join(r.dir, 'results.json')) ? readJson(join(r.dir, 'results.json')) : null);
  return {
    runs: latest,
    api: results(latest.api),
    manual: results(latest.manual),
    load: results(latest.load),
    isolation:
      latest.isolation && existsSync(join(latest.isolation.dir, 'isolation.json'))
        ? readJson(join(latest.isolation.dir, 'isolation.json'))
        : null,
  };
}

// Defects listed in the Bug_Reports summary table: id → severity.
function defects() {
  const md = readFileSync('deliverables/Bug_Reports.md', 'utf8');
  const out = {};
  for (const m of md.matchAll(/^\| \[(BUG-\d+)\]\(#bug-\d+\) \|[^|]*\| (Critical|High|Medium|Low) \|/gm))
    out[m[1]] = m[2];
  return out;
}

// ---------------------------------------------------------------- load facts

// Per load test: transfers confirmed and the balance gap (S change + T change) it left, in cents.
function loadGaps(load) {
  let prev = load.fixture.before;
  return load.tests.map((t) => {
    if (!t.after) return { test: t.test, skipped: t.skipped || 'not started' };
    const dS = t.after.S.cents - prev.S.cents;
    const dT = t.after.T.cents - prev.T.cents;
    prev = t.after;
    return { test: t.test, ok: t.transferOk || 0, dS, dT, gap: dS + dT };
  });
}

// "read p95 L1 336 ms → L2 349 ms; transfer p95 L3 371 ms → L4 657 ms" (first row of each test).
function loadSpeed(load) {
  const row = (id) => load.tests.find((t) => t.test === id)?.rows?.[0];
  const pair = (a, b, what) => {
    const [x, y] = [row(a), row(b)];
    return x && y ? `${what} p95 ${a} ${x.p95} ms → ${b} ${y.p95} ms` : null;
  };
  return [pair('L1', 'L2', 'read'), pair('L3', 'L4', 'transfer')].filter(Boolean).join('; ');
}

function loadMoney(load) {
  const gaps = loadGaps(load);
  const bad = gaps.filter((g) => g.gap);
  const notStarted = gaps.filter((g) => g.skipped).map((g) => g.test);
  const total = gaps.reduce((a, g) => a + (g.gap || 0), 0);
  const tail = notStarted.length ? `; ${notStarted.join(', ')} not started (stop rule after a balance gap)` : '';
  if (load.reconciliation.verdict === 'PASS') return `balances reconcile to the cent${tail}`;
  if (!bad.length) return `reconciliation ${load.reconciliation.verdict}${tail}`;
  const where = bad.map((g) => `${g.test} ${signed(g.gap)}`).join(', ');
  return `${money(Math.abs(total))} ${total > 0 ? 'created' : 'lost'} (${where})${tail}`;
}

// ---------------------------------------------------------------- bug blocks

function bundle(id) {
  const dir = join('evidence/bugs', id);
  const repro = existsSync(join(dir, 'repro.json')) ? readJson(join(dir, 'repro.json')) : null;
  const s3 = existsSync(join(dir, 'stage3-failures.json')) ? readJson(join(dir, 'stage3-failures.json')).records : [];
  const head = existsSync(join(dir, 'repro.md')) ? readFileSync(join(dir, 'repro.md'), 'utf8') : '';
  const who = head.match(/Throwaway user (\S+) \(customer (\d+)\)/);
  return { repro, s3, user: who?.[1], customer: who?.[2] };
}

const compact = (text, max = 150) => {
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^<(!doctype|html)/i.test(t)) return 'HTML error page';
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
const balances = (s) =>
  s.before && Object.keys(s.before).length
    ? '   ' +
      Object.keys(s.before)
        .map(
          (k) =>
            `${k}: ${Number(s.before[k]).toFixed(2)} → ${s.after?.[k] == null ? '?' : Number(s.after[k]).toFixed(2)}`,
        )
        .join(' · ')
    : '';
const chai = (f) => f.replace(/: expected [\s\S]*$/, '');

function bugEnv(id, I, doc) {
  const b = bundle(id);
  const r = I.runs.repro;
  if (!b.repro || !r) return null;
  const at = b.repro.steps.map((s) => s.at).filter(Boolean);
  const span = at.length ? `${day(at[0])} ${hhmm(at[0], true)}–${hhmm(at.at(-1), true)} UTC` : day(r.started);
  const detected = [];
  if (b.s3.length && I.runs.api) detected.push(`detected by API run ${runLink(I.runs.api, doc)}`);
  const manualIds = (CASES[id] || []).filter((c) => I.manual?.results?.some((m) => m.id === c));
  if (manualIds.length && I.runs.manual)
    detected.push(`manual run ${runLink(I.runs.manual, doc)} (${manualIds.join(', ')})`);
  return `public sandbox, ${span}; reproduction run ${runLink(r, doc)} on throwaway user ${b.user} (customer ${b.customer})${detected.length ? `; ${detected.join('; ')}` : ''}`;
}

function bugResult(id, I) {
  const b = bundle(id);
  if (!b.repro) return null;
  const fails = b.repro.steps.filter((s) => s.kind === 'fail');
  const request = fails.map((s) => `${s.method} ${path(s.url)}${s.requestBody ? `\n${s.requestBody}` : ''}`).join('\n');
  const tag = { control: 'control ·', fail: 'tested  ·', state: 'read    ·' };
  const lines = b.repro.steps.map(
    (s) => `${tag[s.kind] || s.kind} ${s.label} → ${s.status} ${compact(s.response)}${balances(s)}`,
  );
  // Stage 3 detection: per case, its distinct failed checks (values included, chai text removed).
  const byCase = {};
  for (const rec of b.s3) for (const f of rec.failures || []) (byCase[rec.case] ||= new Set()).add(chai(f));
  for (const [c, fs] of Object.entries(byCase)) lines.push(`Stage 3 · ${c}: ${[...fs].slice(0, 3).join(' · ')}`);
  for (const c of CASES[id] || []) {
    const m = I.manual?.results?.find((x) => x.id === c);
    if (m) lines.push(`manual · ${c}: ${m.verdict} — ${compact(m.observation, 220)}`);
  }
  return `\n**Request:**\n\`\`\`\n${request}\n\`\`\`\n\n**Actual result:**\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`;
}

// BUG-016 comes from the load test and its isolation run, not from the reproduction script.
function bug016Env(I, doc) {
  const [l, i] = [I.runs.load, I.runs.isolation];
  if (!l || !I.load) return null;
  const iso =
    i && I.isolation
      ? ` and isolation run ${runLink(i, doc)} (throwaway customer ${I.isolation.fixture.customerId})`
      : '';
  return `public sandbox, ${day(l.started)} ${hhmm(l.started)}–${hhmm((i || l).finished || (i || l).started)} UTC; load run ${runLink(l, doc)} (throwaway customer ${I.load.fixture.customerId})${iso}`;
}

function bug016Result(I) {
  if (!I.load) return null;
  const lines = [];
  const iso = I.isolation;
  if (iso) {
    lines.push(`every request: 200 "Successfully transferred $1.00 …"`);
    for (const s of iso.steps)
      lines.push(
        `isolation · ${s.label}: ${s.ok}/${s.sent} confirmed, S ${signed(s.dS)}, T ${signed(s.dT)}${s.dS + s.dT ? ` → ${money(s.dS + s.dT)} not debited from S (S is now ${money(s.S.balance - s.S.historySum)} above the sum of its own transactions)` : ' → reconciles'}`,
      );
  }
  const rows = Object.fromEntries(I.load.reconciliation.rows.map((r) => [r.check, r]));
  const sRow = Object.values(rows).find((r) => /^S decreased/.test(r.check));
  const tRow = Object.values(rows).find((r) => /^T increased/.test(r.check));
  const ok = I.load.reconciliation.transfers?.ok;
  if (sRow && tRow)
    lines.push(
      `load run: ${ok} confirmed transfers → S ${signed(sRow.actual)}, T ${signed(tRow.actual)} (expected S ${signed(sRow.expected)}) → reconciliation ${I.load.reconciliation.verdict}`,
    );
  lines.push(
    `balances after each test: ${loadGaps(I.load)
      .map((g) => (g.skipped ? `${g.test} not started` : `${g.test} gap ${signed(g.gap)}`))
      .join(' · ')}`,
  );
  const reqLine = iso
    ? `5 × in parallel:\nPOST /parabank/services/bank/transfer?fromAccountId=${iso.fixture.S}&toAccountId=${iso.fixture.T}&amount=1.00`
    : `POST /parabank/services/bank/transfer?fromAccountId=S&toAccountId=T&amount=1.00 (5 at once)`;
  return `\n**Request:**\n\`\`\`\n${reqLine}\n\`\`\`\n\n**Actual result:**\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`;
}

// evidence/bugs/BUG-016/: copies of the load and isolation results plus a readable repro.md.
function writeBug016(I, check) {
  const [l, i] = [I.runs.load, I.runs.isolation];
  if (!l || !I.load || I.load.reconciliation.verdict !== 'FAIL' || !i || !I.isolation) return [];
  const dir = 'evidence/bugs/BUG-016';
  const section = (md, from) => {
    const start = md.indexOf(from);
    if (start < 0) return '';
    const next = md.indexOf('\n## ', start + from.length);
    return md.slice(start, next < 0 ? undefined : next).trim();
  };
  const lsum = readFileSync(join(l.dir, 'summary.md'), 'utf8');
  const isum = readFileSync(join(i.dir, 'summary.md'), 'utf8').split('\n').slice(1).join('\n').trim();
  const doc = join(dir, 'repro.md');
  const md = [
    '# BUG-016 — concurrent transfers lose debits (money created)',
    '',
    'Built by `tests/scripts/update-docs.mjs` from the two kept runs below (copied, not re-measured): the load session that detected it and the isolation run that pinned it to simultaneous requests. Machine-readable copies: `load-reconciliation.json`, `isolation.json`.',
    '',
    `## 1. Detection — load run \`${l.id}\``,
    '',
    section(lsum, '## Balances after each test').replace(/^## /, '### '),
    '',
    section(lsum, '## L6').replace(/^## /, '### '),
    '',
    `## 2. Isolation — run \`${i.id}\` (fresh throwaway customer, sequential control first)`,
    '',
    isum,
    '',
    `Full runs: [load summary](${rel(doc, join(l.dir, 'summary.md'))}) · [isolation summary](${rel(doc, join(i.dir, 'summary.md'))}).`,
    '',
  ].join('\n');
  const files = {
    [join(dir, 'load-reconciliation.json')]: `${JSON.stringify({ run: l.id, ...I.load }, null, 2)}\n`,
    [join(dir, 'isolation.json')]: `${JSON.stringify({ run: i.id, ...I.isolation }, null, 2)}\n`,
    [doc]: md,
  };
  const changed = [];
  for (const [p, text] of Object.entries(files)) {
    const out = redact(text);
    if (existsSync(p) && readFileSync(p, 'utf8') === out) continue;
    changed.push(p);
    if (!check) {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, out);
    }
  }
  return changed;
}

// ---------------------------------------------------------------- marker values

function runLink(r, doc) {
  return `[\`${r.id}\`](${rel(doc, join(r.dir, 'summary.md'))})`;
}

const countsText = (c = {}) =>
  Object.entries(c)
    .filter(([, n]) => n !== undefined)
    .map(([k, n]) => `${n} ${k}`)
    .join(' · ');

// One value per marker name. Returns null when the run it needs is missing (the old text stays).
function value(name, doc, I) {
  const [kind, arg] = name.split(/:(.*)/s);
  const R = I.runs;
  switch (kind) {
    case 'run':
      return R[arg] ? runLink(R[arg], doc) : null;
    case 'summary': {
      const r = R[arg];
      if (!r) return null;
      if (arg === 'load' && I.load)
        return `${r.slaVerdicts?.every((v) => v === 'PASS') ? 'every SLA met' : `SLA verdicts ${r.slaVerdicts?.join(', ')}`} (${loadSpeed(I.load)}); money: ${loadMoney(I.load)}; session verdict ${r.verdict}`;
      if (arg === 'isolation' && I.isolation) {
        // Per round: money created = S change + T change (the run's `lost` field is cumulative).
        const lost = I.isolation.steps.filter((s) => s.dS + s.dT);
        return lost.length
          ? `${lost.map((s) => `${s.label} created ${money(s.dS + s.dT)}`).join(', ')}; every other round and the sequential control reconcile`
          : 'every round reconciles (not reproduced)';
      }
      if (arg === 'repro') return `${(r.bundles || []).length} defect bundles`;
      return countsText(r.counts);
    }
    case 'jrn01': {
      const c = I.api?.cases?.['JRN-01'];
      return c ? `${c.pass}/${c.pass + c.fail.length}` : null;
    }
    case 'nfr': {
      const row = I.api?.nfr?.find((x) => x.endpoint === arg);
      return row ? `p95 ${row.p95} ms (n ${row.n})` : null;
    }
    case 'load-speed':
      return I.load ? loadSpeed(I.load) : null;
    case 'load-money':
      return I.load ? loadMoney(I.load) : null;
    case 'ui-shot': {
      const r = R.ui;
      if (!r || !existsSync(join(r.dir, 'screenshots'))) return null;
      const f = readdirSync(join(r.dir, 'screenshots')).find((x) => x.startsWith(`activity-${arg}-`));
      return f ? `[\`${join(r.dir, 'screenshots', f)}\`](${rel(doc, join(r.dir, 'screenshots', f))})` : null;
    }
    case 'cycle-date':
      return R.api ? day(R.api.started) : null;
    case 'defects': {
      const d = Object.values(defects());
      return `${d.length} open defects, ${d.filter((s) => s === 'Critical').length} of them Critical`;
    }
    case 'defect-count':
      return String(Object.keys(defects()).length);
    case 'critical-count':
      return String(Object.values(defects()).filter((s) => s === 'Critical').length);
    case 'test-runs':
      return testRuns(doc, I);
    case 'bug-env':
      return arg === 'BUG-016' ? bug016Env(I, doc) : bugEnv(arg, I, doc);
    case 'bug-result':
      return arg === 'BUG-016' ? bug016Result(I) : bugResult(arg, I);
    default:
      throw new Error(`${doc}: unknown marker "auto:${name}"`);
  }
}

// The run list at the top of Bug_Reports.md.
function testRuns(doc, I) {
  const R = I.runs;
  if (!R.api || !R.repro) return null;
  const users = R.repro.users || {};
  const lines = [
    `- Stage 3 detection run ${runLink(R.api, doc)} (<USERNAME>)${R.ui ? `; UI cross-check ${runLink(R.ui, doc)}` : ''}${R.manual ? `; manual run ${runLink(R.manual, doc)}` : ''}.`,
  ];
  if (R.load && I.load)
    lines.push(
      `- Stage 5 load run ${runLink(R.load, doc)}${R.isolation && I.isolation ? ` and isolation run ${runLink(R.isolation, doc)}` : ''} (k6 and Node \`fetch\`, throwaway customers ${[I.load.fixture.customerId, I.isolation?.fixture.customerId].filter(Boolean).join(' and ')}) — BUG-016.`,
    );
  lines.push(
    `- Stage 4 reproduction run ${runLink(R.repro, doc)} on fresh throwaway users: ${Object.entries(users)
      .map(([k, u]) => `user ${k} \`${u.username}\` (customer ${u.customerId})`)
      .join(' and ')}, ${hhmm(R.repro.started)}–${hhmm(R.repro.finished || R.repro.started)} UTC.`,
  );
  return `\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- run

export function updateDocs({ since, check = false, log = console.log } = {}) {
  const I = loadInputs(since);
  const changed = writeBug016(I, check);
  const stale = [];
  for (const doc of DOCS.filter((d) => existsSync(d))) {
    const text = readFileSync(doc, 'utf8');
    const out = text.replace(/<!-- auto:([^>]+?) -->([\s\S]*?)<!-- \/auto:\1 -->/g, (all, name, old) => {
      const v = value(name, doc, I);
      if (v == null) {
        stale.push(`${doc}: auto:${name} (no matching kept run${since ? ` since ${since}` : ''}; text kept)`);
        return all;
      }
      return `<!-- auto:${name} -->${redact(v)}<!-- /auto:${name} -->`;
    });
    if (out !== text) {
      changed.push(doc);
      if (!check) writeFileSync(doc, out);
    }
  }
  log(
    `${check ? 'Out of date' : 'Updated'}: ${changed.length ? changed.join(', ') : 'nothing'}` +
      (stale.length ? `\nNot updated:\n  ${stale.join('\n  ')}` : ''),
  );
  return { changed, stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--since');
  const since = i >= 0 ? args[i + 1] : undefined;
  if (since && Number.isNaN(Date.parse(since))) {
    console.error(`--since needs an ISO date, got "${since}"`);
    process.exit(2);
  }
  const check = args.includes('--check');
  const { changed } = updateDocs({ since, check });
  process.exit(check && changed.length ? 1 : 0);
}
