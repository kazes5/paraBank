// Shared helpers for every test script: paths, users, redaction, paced HTTP, throwaway users,
// run folders, and the results index / history.
//
// Run layout (see README.md):
//   results/runs/<runId>/   every run (git-ignored)      results/kept/<runId>/   kept runs (committed)
//   <runId> = <UTC timestamp>-<kind>, kind = api | ui | manual | repro | load
//   Each run folder: run.json, summary.md, results.json, logs/, reports/, screenshots/, failures/

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';

// Repo root, resolved from this file's location (tests/scripts/lib/ → three levels up).
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(ROOT); // every path below is relative to the repo root

// Where runs go: every run starts in results/runs/ (git-ignored) and can be kept in results/kept/.
// BASE / API: the public ParaBank sandbox unless BASE_URL overrides it in .env.
export const RUNS = 'results/runs';
export const KEPT = 'results/kept';
export const BASE = process.env.BASE_URL || 'https://parabank.parasoft.com/parabank';
export const API = `${BASE}/services/bank`;
// Small utilities: wait N ms; convert a money amount to integer cents (compare money without float errors).
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const cents = (x) => Math.round(Number(x) * 100);

// ---------------------------------------------------------------- users and secrets

// Reads one test user from .env by prefix (PARABANK_* or PARABANK2_*): credentials and registration profile.
export function readUser(prefix = 'PARABANK') {
  const e = (k) => process.env[`${prefix}_${k}`] || '';
  return {
    prefix,
    username: e('USERNAME'),
    password: e('PASSWORD'),
    ssn: e('SSN'),
    firstName: e('FIRST_NAME'),
    lastName: e('LAST_NAME'),
    street: e('STREET'),
    city: e('CITY'),
    state: e('STATE'),
    zipCode: e('ZIP'),
    phoneNumber: e('PHONE'),
    fallbackAccountId: e('FALLBACK_ACCOUNT_ID'),
  };
}

// Values that must never appear in any output file: the .env passwords and SSNs,
// plus anything added at run time with addSecret() (e.g. throwaway users' passwords).
const secrets = ['PARABANK_PASSWORD', 'PARABANK_SSN', 'PARABANK2_PASSWORD', 'PARABANK2_SSN']
  .map((k) => process.env[k])
  .filter(Boolean);
export const addSecret = (...s) => secrets.push(...s.filter(Boolean));
// Every encoding a secret can appear in: raw, path-encoded, query/form-encoded, JSON-escaped
const encodings = (s) => [
  ...new Set([
    s,
    encodeURIComponent(s),
    new URLSearchParams({ x: s }).toString().slice(2),
    JSON.stringify(s).slice(1, -1),
  ]),
];
// The test users' profile (username, name, address, phone) is personal data and the repo is public:
// every value is replaced by a placeholder such as <FIRST_NAME>. Whole words only (case-sensitive),
// so a short value like a 3-letter first name never mangles other words.
const PROFILE_FIELDS = ['USERNAME', 'FIRST_NAME', 'LAST_NAME', 'STREET', 'CITY', 'STATE', 'ZIP', 'PHONE'];
export const PROFILE = ['PARABANK', 'PARABANK2'].flatMap((p) =>
  PROFILE_FIELDS.map((k) => [process.env[`${p}_${k}`], `<${k}>`]).filter(([v]) => v),
);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const profileForms = new Map(PROFILE.flatMap(([v, label]) => encodings(v).map((e) => [e, label])));
const profileRe = profileForms.size
  ? new RegExp(
      `(?<![A-Za-z0-9])(${[...profileForms.keys()]
        .sort((a, b) => b.length - a.length)
        .map(escRe)
        .join('|')})(?![A-Za-z0-9])`,
      'g',
    )
  : null;

// Replaces every secret, in every encoding, with <REDACTED>, then every profile value with its placeholder.
export const redact = (t) => {
  // Absolute local paths (printed by the Postman CLI, Playwright, pytest) reveal the user's home folder
  // name: the repo path becomes relative, any other home path becomes ~.
  const home = process.env.HOME;
  const local = String(t ?? '')
    .split(ROOT)
    .join('')
    .split(ROOT.replace(/\/$/, ''))
    .join('.');
  const out = secrets.reduce(
    (acc, s) => encodings(s).reduce((u, e) => u.split(e).join('<REDACTED>'), acc),
    home && home.length > 1 ? local.split(home).join('~') : local,
  );
  return profileRe ? out.replace(profileRe, (m) => profileForms.get(m)) : out;
};

// The Postman CLI prints console output wrapped over many "  | " lines, cutting words (and so secrets or
// profile values) in two, where redact() cannot see them. unwrapCli() joins each wrapped block into one
// "  | " line first; the parsers (summarize, failures) concatenate those lines anyway, so they read the
// same content. Always redact CLI output as redact(unwrapCli(text)).
export const unwrapCli = (text) =>
  String(text ?? '')
    .split('\n')
    .reduce((out, line) => {
      if (line.startsWith('  | ') && out.length && out.at(-1).startsWith('  | ')) out[out.length - 1] += line.slice(4);
      else out.push(line);
      return out;
    }, [])
    .join('\n');

// Redacts one text file in place. In XML (e.g. JUnit reports) the placeholders are escaped (&lt;…&gt;)
// so the file stays valid XML.
export function redactFile(p) {
  let t = readFileSync(p, 'utf8');
  t = redact(/\.log$/i.test(p) ? unwrapCli(t) : t); // CLI logs: rejoin wrapped lines first
  if (/\.xml$/i.test(p))
    t = t.replace(/<(REDACTED|[A-Z_]+)>/g, (m, k) =>
      k === 'REDACTED' || PROFILE_FIELDS.includes(k) ? `&lt;${k}&gt;` : m,
    );
  writeFileSync(p, t);
}

// Redacts every text file under a folder in place (Postman reports, logs); images and PDFs are skipped.
export function redactTree(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) redactTree(p);
    else if (!/\.(png|jpe?g|pdf)$/i.test(f)) redactFile(p);
  }
}

// Takes a screenshot with the test users' profile masked: every text node and form value containing a
// profile value shows the placeholder, the screenshot is taken, then the page is restored exactly
// (so a later step never submits a placeholder). Used by the UI cross-check and the manual tests.
export async function maskedScreenshot(page, options) {
  const pairs = [...profileForms.entries()];
  if (!pairs.length) return page.screenshot(options);
  await page.evaluate((pairs) => {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const map = new Map(pairs);
    const re = new RegExp(
      `(?<![A-Za-z0-9])(${pairs
        .map(([v]) => v)
        .sort((a, b) => b.length - a.length)
        .map(esc)
        .join('|')})(?![A-Za-z0-9])`,
      'g',
    );
    const fix = (s) => s.replace(re, (m) => map.get(m));
    const undo = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      const f = fix(v);
      if (f !== v) {
        undo.push(() => (n.nodeValue = v));
        n.nodeValue = f;
      }
    }
    for (const el of document.querySelectorAll('input, textarea')) {
      const v = el.value;
      const f = fix(v);
      if (f !== v) {
        undo.push(() => (el.value = v));
        el.value = f;
      }
    }
    window.__unmask = () => undo.forEach((u) => u());
  }, pairs);
  try {
    return await page.screenshot(options);
  } finally {
    await page.evaluate(() => window.__unmask?.()).catch(() => {});
  }
}

// ---------------------------------------------------------------- HTTP (paced, aborts on rate limit)

// Admin endpoints that affect every user of the shared site: never called (ground rule).
//
// http(): one paced API call. Waits `pace` ms first, builds the URL with query parameters,
// sends JSON, stops the whole script on HTTP 429, and returns status, time, raw text and parsed JSON.
const FORBIDDEN = /cleanDB|initializeDB|setParameter|JmsListener/i;
export async function http(method, path, { query, body, pace = 1500 } = {}) {
  await sleep(pace); // public site rate-limits bursts (STD O6)
  const url = new URL(API + path);
  if (FORBIDDEN.test(url.pathname)) throw new Error(`Forbidden endpoint: ${url.pathname}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t0 = Date.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 429) throw new Error('Rate limited (HTTP 429): stop and retry later');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* text or HTML */
  }
  return { url: url.toString(), status: res.status, ms: Date.now() - t0, text, json };
}

// Registers a throwaway customer through the web form (for destructive or fresh-data tests)
export async function registerThrowaway(tag = 'qa') {
  const u = {
    username: `${tag}_${Date.now().toString(36)}`,
    password: `Tmp-${randomBytes(6).toString('hex')}`,
    ssn: String(randomInt(100000000, 999999999)),
  };
  addSecret(u.password, u.ssn);
  const page = await fetch(`${BASE}/register.htm`);
  const cookie = (page.headers.get('set-cookie') || '').split(';')[0];
  const form = new URLSearchParams({
    'customer.firstName': 'QA',
    'customer.lastName': 'Throwaway',
    'customer.address.street': '1 Test St',
    'customer.address.city': 'Testville',
    'customer.address.state': 'TS',
    'customer.address.zipCode': '00000',
    'customer.phoneNumber': '5550000',
    'customer.ssn': u.ssn,
    'customer.username': u.username,
    'customer.password': u.password,
    repeatedPassword: u.password,
  });
  const res = await fetch(`${BASE}/register.htm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: form,
  });
  if (!/created successfully/i.test(await res.text()))
    throw new Error(`Throwaway registration failed (HTTP ${res.status})`);
  u.customerId = (await http('GET', `/login/${u.username}/${encodeURIComponent(u.password)}`)).json.id;
  u.A = (await http('GET', `/customers/${u.customerId}/accounts`)).json[0].id;
  return u;
}

// ---------------------------------------------------------------- run folders

// Run ID timestamp: UTC ISO time without milliseconds, ':' replaced by '-' (safe in file names).
const stamp = () =>
  new Date()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');
// Short git commit of the code that produced a run (empty outside a git checkout).
const gitCommit = () => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

// Creates results/runs/<UTC>-<kind>/ with run.json, and remembers it as the last run (for --keep).
// Returns the run ID and folder, sub(name) to create a subfolder, and update(fields) to add to run.json.
export function newRun(kind, meta = {}) {
  const id = `${stamp()}-${kind}`;
  const dir = join(RUNS, id);
  mkdirSync(dir, { recursive: true });
  const run = { id, kind, started: new Date().toISOString(), commit: gitCommit(), ...meta };
  writeFileSync(join(dir, 'run.json'), redact(`${JSON.stringify(run, null, 2)}\n`)); // never the raw username
  writeFileSync(join('results', '.last-run'), `${id}\n`);
  const sub = (name) => {
    const p = join(dir, name);
    mkdirSync(p, { recursive: true });
    return p;
  };
  const update = (fields) => {
    const cur = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    writeFileSync(join(dir, 'run.json'), redact(`${JSON.stringify({ ...cur, ...fields }, null, 2)}\n`));
  };
  return { id, dir, sub, update };
}

// Every run with a run.json, local and kept, sorted oldest → newest (IDs start with the UTC time).
export function allRuns() {
  const out = [];
  for (const [base, kept] of [
    [RUNS, false],
    [KEPT, true],
  ]) {
    if (!existsSync(base)) continue;
    for (const id of readdirSync(base)) {
      const f = join(base, id, 'run.json');
      if (existsSync(f)) out.push({ ...JSON.parse(readFileSync(f, 'utf8')), dir: join(base, id), kept });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// The run types a test cycle is reported from, each with the test that picks a *complete* run of that
// type: the load session's smoke gates are API runs too (smoke only), the isolation run is a load run,
// and a manual run may cover only some cases. The STR and the web page both use this list, so the page
// shows exactly the runs the report is built from.
export const MANUAL_CASES = ['AUTH-03', 'AUTH-05', 'TRF-08', 'TRF-09'];
const hasResults = (r) => existsSync(join(r.dir, 'results.json'));
export const RUN_TYPES = [
  { key: 'api', label: 'API tests', test: (r) => r.kind === 'api' && (r.phases || []).length === 3 && hasResults(r) },
  { key: 'ui', label: 'Web UI cross-check', test: (r) => r.kind === 'ui' && hasResults(r) },
  {
    key: 'manual',
    label: 'Manual cases',
    test: (r) => r.kind === 'manual' && MANUAL_CASES.every((id) => (r.scope || '').includes(id)),
  },
  { key: 'auto', label: 'Coded tests (pytest)', test: (r) => r.kind === 'auto' && hasResults(r) },
  {
    key: 'load',
    label: 'Load test L1–L6',
    test: (r) => r.kind === 'load' && !r.dry && r.scope === 'L1–L6' && hasResults(r),
  },
  {
    key: 'isolation',
    label: 'Concurrency isolation',
    test: (r) => r.kind === 'load' && r.scope === 'concurrency isolation',
  },
  { key: 'repro', label: 'Defect reproduction', test: (r) => r.kind === 'repro' },
  { key: 'report', label: 'Test Summary Report', test: (r) => r.kind === 'report' },
];

// 'latest' | runId -> run; kind filters, keptOnly prefers committed evidence
export function findRun(ref = 'latest', { kind, keptOnly = false } = {}) {
  const runs = allRuns().filter((r) => (!kind || r.kind === kind) && (!keptOnly || r.kept));
  const r = ref === 'latest' ? runs.at(-1) : runs.find((x) => x.id === ref || x.id.startsWith(ref));
  if (!r) throw new Error(`No ${kind || ''} run found for "${ref}"${keptOnly ? ' among kept runs' : ''}`);
  return r;
}

// Moves a local run to results/kept/ (committed) and refreshes the index. Already kept → no change.
export function keepRun(ref) {
  const r = findRun(ref);
  if (r.kept) return r;
  mkdirSync(KEPT, { recursive: true });
  renameSync(r.dir, join(KEPT, r.id));
  rebuildIndex();
  return { ...r, dir: join(KEPT, r.id), kept: true };
}

// ---------------------------------------------------------------- index and history

// One-letter verdicts for the history table.
const VERDICT_SHORT = { PASS: 'P', FAIL: 'F', 'NEEDS-CLARIFICATION': 'N', BLOCKED: 'B', 'NOT RUN': '·' };

// Rewrites results/index.md (one row per run, newest first) and results/history.md
// (each case's verdict across the last 10 API runs, with ⚠ where it changed).
export function rebuildIndex() {
  const runs = allRuns().reverse();
  const link = (r) => `[summary](${relative('results', join(r.dir, 'summary.md'))})`;
  const counts = (r) =>
    r.counts
      ? Object.entries(r.counts)
          .filter(([, n]) => n)
          .map(([k, n]) => `${k} ${n}`)
          .join(' · ')
      : '—';
  writeFileSync(
    'results/index.md',
    [
      '# Test runs',
      '',
      'Every run, newest first. **Kept** runs are committed under `results/kept/`; the others live only on the machine that ran them (`results/runs/`, git-ignored).',
      'Keep a run with `./run.sh keep <runId>`. Regenerated automatically after every run.',
      '',
      '| Run | Kind | Scope | User | Result | Kept | Summary |',
      '|---|---|---|---|---|---|---|',
      ...runs.map(
        (r) =>
          `| ${r.id} | ${r.kind} | ${r.scope || (r.phases || []).join(', ') || '—'} | ${r.user || '—'} | ${counts(r)} | ${r.kept ? 'yes' : 'local'} | ${link(r)} |`,
      ),
      '',
    ].join('\n'),
  );

  // history: case x last 10 api runs that have per-case verdicts
  const api = allRuns()
    .filter((r) => r.kind === 'api' && existsSync(join(r.dir, 'results.json')))
    .slice(-10);
  const verdicts = api.map((r) =>
    Object.fromEntries(
      (JSON.parse(readFileSync(join(r.dir, 'results.json'), 'utf8')).rows || []).map((x) => [x.id, x.verdict]),
    ),
  );
  // Rows of the history table: every case that appears in any of those runs, in STD order.
  const ids = [...new Set(verdicts.flatMap((v) => Object.keys(v)))];
  const stdLines = readFileSync('deliverables/STD.md', 'utf8').split('\n');
  const order = (id) => {
    const i = stdLines.findIndex((l) => l.startsWith(`| ${id} | `));
    return i < 0 ? 1e9 : i;
  };
  ids.sort((a, b) => order(a) - order(b));
  writeFileSync(
    'results/history.md',
    [
      '# Verdict history (last 10 API runs)',
      '',
      'P = PASS · F = FAIL · N = NEEDS-CLARIFICATION · B = BLOCKED · · = not run in that run. ⚠ = the verdict changed between the last two runs that executed the case.',
      '',
      `| Case | ${api.map((r) => `${r.id.slice(5, 10)} ${r.id.slice(11, 19).replace(/-/g, ':')}${r.kept ? '' : '*'}`).join(' | ')} | Changed |`,
      `|---|${api.map(() => '---').join('|')}|---|`,
      ...ids.map((id) => {
        const cells = verdicts.map((v) => VERDICT_SHORT[v[id]] ?? '·');
        const ran = cells.filter((c) => c !== '·');
        const changed = ran.length >= 2 && ran.at(-1) !== ran.at(-2) ? '⚠' : '';
        return `| ${id} | ${cells.join(' | ')} | ${changed} |`;
      }),
      '',
      api.some((r) => !r.kept) ? '\\* local run (not committed).' : '',
      '',
    ].join('\n'),
  );
}
