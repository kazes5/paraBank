// Local test-runner web page: choose what to run, watch the progress live, then get the verdict
// and links to the reports, bugs, evidence and deliverables.
//
// - Listens on 127.0.0.1 only and accepts only localhost Host headers (no access from the network,
//   no DNS-rebinding). POSTs must be JSON from this page's own origin (no cross-site requests).
// - Runs only the whitelisted ./run.sh commands below, one job at a time, steps in a fixed order.
// - Console output is redacted (passwords and SSNs from .env) before it reaches the browser.
// - /view/<path> shows repo files read-only: Markdown rendered, folders listed; dotfiles (.env, .git) refused.
//
// Usage: ./run.sh web [--port 4321]     then open http://127.0.0.1:4321

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env before importing common.mjs: it reads the secrets to redact when it loads.
const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(join(ROOT_DIR, '.env'))) process.loadEnvFile(join(ROOT_DIR, '.env'));
const { ROOT, allRuns, redact, RUN_TYPES } = await import('../scripts/lib/common.mjs');
const { marked } = await import('marked');

const portArg = process.argv.indexOf('--port');
const PORT = Number(portArg > 0 ? process.argv[portArg + 1] : process.env.WEB_PORT || 4321);
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

// ---------------------------------------------------------------- steps

// Every step the page can run, in execution order. minutes = typical duration (for the progress bar).
// userOpt: the step accepts --user; keepOpt: the step creates a run that --keep can keep.
const STEPS = [
  {
    id: 'setup',
    label: 'Set up test users',
    desc: 'Register or verify the .env users. Needed after a site reset.',
    args: ['setup'],
    minutes: 0.5,
  },
  {
    id: 'explore',
    label: 'Stage 1 exploration',
    desc: 'Journey walk + edge probes on a new throwaway customer; refreshes evidence/exploration/ (the documents cite it).',
    args: ['explore'],
    minutes: 5,
  },
  {
    id: 'smoke',
    label: 'API smoke',
    desc: '6 cases that prove the API is usable at all.',
    args: ['smoke'],
    minutes: 1,
    userOpt: true,
    keepOpt: true,
    kind: 'api',
  },
  {
    id: 'all',
    label: 'API tests: smoke + suites + journey',
    desc: 'The full Postman collection (all STD API cases).',
    args: ['all'],
    minutes: 12,
    userOpt: true,
    keepOpt: true,
    kind: 'api',
  },
  {
    id: 'ui',
    label: 'Web UI cross-check',
    desc: 'Compares the latest API run with what the web UI shows.',
    args: ['ui', 'latest'],
    minutes: 2,
    userOpt: true,
    keepOpt: true,
    kind: 'ui',
  },
  {
    id: 'manual',
    label: 'Manual cases',
    desc: 'AUTH-03, AUTH-05, TRF-08, TRF-09 in Chrome, with screenshots.',
    args: ['manual'],
    minutes: 4,
    keepOpt: true,
    kind: 'manual',
  },
  {
    id: 'auto',
    label: 'Coded tests (pytest)',
    desc: 'JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03.',
    args: ['auto'],
    minutes: 2.5,
    userOpt: true,
    keepOpt: true,
    kind: 'auto',
  },
  {
    id: 'repro',
    label: 'Reproduce known defects',
    desc: 'Every bug re-run on fresh throwaway users, with evidence bundles.',
    args: ['repro'],
    minutes: 6,
    keepOpt: true,
    kind: 'repro',
  },
  {
    id: 'load',
    label: 'Load test L1–L6 (k6)',
    desc: 'Small, paced load session with balance reconciliation.',
    args: ['load'],
    minutes: 14,
    keepOpt: true,
    kind: 'load',
  },
  {
    id: 'isolate',
    label: 'Concurrency isolation',
    desc: 'Only after a load run in this job that failed reconciliation (else skipped): 5 sequential, then 3 × 5 simultaneous transfers on a fresh customer.',
    args: ['isolate'],
    minutes: 1.5,
    keepOpt: true,
    kind: 'load',
  },
  {
    id: 'report',
    label: 'Test Summary Report (STR)',
    desc: "Two-page STR + detailed annex (Markdown and PDF), with a GO / NO-GO recommendation. With test steps in the same job, only that job's runs are used.",
    args: ['report'],
    minutes: 1,
    kind: 'report',
  },
];
const STEP = Object.fromEntries(STEPS.map((s) => [s.id, s]));

// Root documents and folders shown under "Deliverables" (only those that exist are listed).
const DELIVERABLES = [
  ['deliverables', 'All deliverables (folder)'],
  ['deliverables/STR.pdf', 'Test Summary Report, 2 pages (PDF)'],
  ['deliverables/STR_Detailed.pdf', 'STR detailed annex (PDF)'],
  ['SUBMISSION.md', 'Submission guide'],
  ['deliverables/STD.md', 'Software Test Description'],
  ['deliverables/Bug_Reports.md', 'Bug reports'],
  ['deliverables/Business_Rules.md', 'Business rules'],
  ['deliverables/postman/ParaBank_QA.postman_collection.json', 'Postman collection'],
  ['deliverables/postman/ParaBank_QA.postman_environment.json', 'Postman environment'],
  ['deliverables/load_test_plan.md', 'Load test plan'],
  ['tests/automation/README.md', 'Coded tests (README)'],
  ['plan.md', 'Test plan and execution status'],
  ['README.md', 'Project README'],
];

// Exit codes of the run scripts → step status shown on the page.
const STATUS = { 0: 'PASS', 1: 'FAIL', 2: 'ERROR', 3: 'BLOCKED', 130: 'STOPPED' };

// Command line for one step, given the options chosen on the page. `since` = the job's start time when
// the job also runs test steps: the report then uses only this job's runs (a crashed layer shows as
// not run instead of being replaced by an older run).
function argsFor(step, o, since) {
  const a = [...step.args];
  if (step.userOpt && o.user !== 'PARABANK') a.push('--user', o.user);
  if (step.keepOpt && o.keep) a.push('--keep');
  if (step.id === 'manual' && !o.showBrowser) a.push('--headless');
  if (step.id === 'repro' && o.publish) a.push('--publish');
  if (step.id === 'report' && o.publish) a.push('--kept', '--publish');
  if (step.id === 'report' && since) a.push('--since', since);
  return a;
}

// ---------------------------------------------------------------- job state and live events

let job = null; // the current or last job: options, steps with status, log tail, verdict
const clients = new Set(); // open event streams (one per browser tab)
const LOG_MAX = 400;

// Send one Server-Sent Event to every open page.
function emit(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// The job as the page sees it (no child process handle).
const publicJob = () => job && { ...job, child: undefined };

// One console line: strip colour codes, redact secrets, keep the last LOG_MAX lines, push to the page.
function addLine(stepId, text) {
  const line = redact(text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).trimEnd();
  if (!line.trim()) return;
  job.log.push({ step: stepId, line });
  if (job.log.length > LOG_MAX) job.log.splice(0, job.log.length - LOG_MAX);
  emit('line', { step: stepId, line });
}

// The run folder a step created: run.sh records it in results/.last-run.
const lastRun = () => {
  try {
    return readFileSync(join(ROOT, 'results/.last-run'), 'utf8').trim();
  } catch {
    return '';
  }
};

// Runs one step as a child process (its own process group, so Stop can end k6 / Chrome / pytest too).
function runStep(step, s) {
  return new Promise((resolve) => {
    const child = spawn('./run.sh', s.args, {
      cwd: ROOT,
      detached: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    job.child = child;
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      for (const l of lines) addLine(step.id, l);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code, signal) => {
      if (buf) addLine(step.id, buf);
      job.child = null;
      resolve(job.stopping || signal ? 130 : code);
    });
  });
}

// Runs the selected steps in order. A failing step does not stop the job (FAIL = defects found);
// only Stop ends it early. At the end the overall verdict is computed.
async function runJob(ids, options) {
  const startIso = new Date().toISOString();
  const testSteps = ids.some((id) => !['setup', 'report'].includes(id));
  job = {
    id: startIso,
    options,
    started: Date.now(),
    finished: null,
    stopping: false,
    log: [],
    verdict: null,
    steps: ids.map((id) => ({
      id,
      label: STEP[id].label,
      minutes: STEP[id].minutes,
      args: argsFor(STEP[id], options, testSteps ? startIso : null),
      status: 'pending',
    })),
  };
  emit('job', publicJob());
  for (const s of job.steps) {
    if (job.stopping) {
      s.status = 'SKIPPED';
      continue;
    }
    const step = STEP[s.id];
    // As in ./run.sh cycle: the isolation runs only when this job's load run failed reconciliation.
    const loadRun = job.steps.find((x) => x.id === 'load')?.run;
    if (s.id === 'isolate' && loadRun?.reconciliation !== 'FAIL') {
      s.status = 'SKIPPED';
      addLine(
        s.id,
        `Skipped: ${loadRun ? `reconciliation ${loadRun.reconciliation || 'not judged'}` : 'no load run in this job'}, nothing to isolate.`,
      );
      emit('job', publicJob());
      continue;
    }
    const before = lastRun();
    s.status = 'running';
    s.started = Date.now();
    emit('job', publicJob());
    addLine(s.id, `$ ./run.sh ${s.args.join(' ')}`);
    const code = await runStep(step, s);
    s.exit = code;
    s.status = STATUS[code] || 'ERROR';
    s.finished = Date.now();
    // Setup or the API smoke gate blocked: nothing after it can be trusted (as in ./run.sh cycle).
    if ((s.id === 'setup' && s.status !== 'PASS') || (s.status === 'BLOCKED' && ['smoke', 'all'].includes(s.id))) {
      addLine(s.id, `${s.label} is BLOCKED: the remaining steps are skipped. Run "Set up test users" and try again.`);
      job.stopping = true;
    }
    const after = lastRun();
    if (after && after !== before) s.run = runInfo(after);
    emit('job', publicJob());
  }
  job.finished = Date.now();
  job.verdict = verdictOf(job);
  emit('job', publicJob());
}

// Summary of one run for the page: folder, summary link, counts and (for reports) the recommendation.
function runInfo(id) {
  const r = allRuns().find((x) => x.id === id);
  if (!r) return { id };
  const files = ['summary.md', 'STR.pdf', 'STR_Detailed.pdf'].filter((f) => existsSync(join(ROOT, r.dir, f)));
  return {
    id: r.id,
    kind: r.kind,
    dir: r.dir,
    kept: r.kept,
    counts: r.counts || null,
    recommendation: r.recommendation || null,
    reconciliation: r.reconciliation || null,
    label: RUN_TYPES.find((t) => t.test(r))?.label || `${r.kind} (partial)`,
    files: files.map((f) => join(r.dir, f)),
  };
}

// Overall verdict of a job:
//   STOPPED / BLOCKED / ERROR when the job could not complete its checks;
//   FAIL = at least one step found failures (today the known defects make API, coded tests and repro FAIL);
//   PASS = every step passed. The release recommendation comes from the STR when the report step ran.
function verdictOf(j) {
  const st = j.steps.map((s) => s.status);
  const failed = j.steps.filter((s) => s.status === 'FAIL').map((s) => s.label);
  const rec = j.steps.find((s) => s.id === 'report')?.run?.recommendation || null;
  let result = 'PASS';
  let why = 'Every selected step passed.';
  if (st.includes('STOPPED')) [result, why] = ['STOPPED', 'Stopped before all steps finished.'];
  else if (st.includes('BLOCKED'))
    [result, why] = [
      'BLOCKED',
      'A step could not run (smoke gate failed, login failed after a site reset, or rate limited). Run "Set up test users" and try again.',
    ];
  else if (st.includes('ERROR')) [result, why] = ['ERROR', 'A step stopped with an error: see its log lines.'];
  else if (failed.length)
    [result, why] = [
      'FAIL',
      `Failures found in: ${failed.join(', ')}. Check whether they are known defects (deliverables/Bug_Reports.md) or new.`,
    ];
  return { result, why, recommendation: rec };
}

// ---------------------------------------------------------------- state for the page

// Latest complete run of each type (the runs the report is built from), newest first: shown before
// any job, so the page is useful straight away. Partial runs (smoke gates, single manual cases) are
// in results/index.md.
function latestRuns() {
  const runs = allRuns();
  return RUN_TYPES.map((t) => runs.filter(t.test).at(-1))
    .filter(Boolean)
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((r) => runInfo(r.id));
}

// Defect evidence bundles under evidence/bugs/.
const bugBundles = () =>
  existsSync(join(ROOT, 'evidence/bugs'))
    ? readdirSync(join(ROOT, 'evidence/bugs'))
        .filter((d) => /^BUG-\d+$/.test(d))
        .sort()
        .map((d) => `evidence/bugs/${d}`)
    : [];

function state() {
  return {
    steps: STEPS.map(({ id, label, desc, minutes, userOpt }) => ({ id, label, desc, minutes, userOpt })),
    users: ['PARABANK', 'PARABANK2'].filter((p) => process.env[`${p}_USERNAME`]),
    envReady: existsSync(join(ROOT, '.env')),
    job: publicJob(),
    latest: latestRuns(),
    deliverables: DELIVERABLES.filter(([p]) => existsSync(join(ROOT, p))).map(([path, label]) => ({ path, label })),
    bugs: bugBundles(),
  };
}

// ---------------------------------------------------------------- file viewer (read-only)

const TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Page shell for rendered Markdown and folder listings.
const shell = (
  title,
  body,
) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font:15px/1.55 -apple-system,system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:16px 24px;color:#1d2433;background:#fff}
a{color:#2457c5}table{border-collapse:collapse;display:block;overflow-x:auto;margin:12px 0}td,th{border:1px solid #d9dee8;padding:4px 8px;text-align:left;vertical-align:top}
th{background:#f3f5f9}code{background:#f3f5f9;padding:1px 4px;border-radius:4px;font-size:13px}pre{background:#f3f5f9;padding:12px;overflow-x:auto;border-radius:6px}
pre code{padding:0}img{max-width:100%}.crumb{font-size:13px;color:#5b6475;margin-bottom:12px}
@media (prefers-color-scheme:dark){body{background:#14171d;color:#e4e7ee}a{color:#7aa7ff}th,code,pre{background:#1f242d}td,th{border-color:#333a46}.crumb{color:#9aa3b2}}
</style></head><body><div class="crumb"><a href="/">← Test runner</a> · ${esc(title)}</div>${body}</body></html>`;

// Serves one repo file or folder. Paths are normalised and must stay inside the repo;
// any segment starting with "." (.env, .git, .venv, .last-run) or node_modules is refused.
function view(res, rel) {
  const p = normalize(decodeURIComponent(rel)).replace(/^\/+/, '').replace(/\/+$/, '');
  if (p.startsWith('..') || p.split('/').some((seg) => seg.startsWith('.') || seg === 'node_modules'))
    return send(res, 403, 'text/plain', 'Not allowed');
  const full = join(ROOT, p);
  if (!existsSync(full)) return send(res, 404, 'text/plain', 'Not found');
  if (statSync(full).isDirectory()) {
    if (!rel.endsWith('/')) return redirect(res, `/view/${p}/`); // so relative links resolve inside the folder
    const items = readdirSync(full)
      .filter((f) => !f.startsWith('.'))
      .sort()
      .map(
        (f) =>
          `<li><a href="${encodeURIComponent(f)}${statSync(join(full, f)).isDirectory() ? '/' : ''}">${esc(f)}</a></li>`,
      );
    return send(
      res,
      200,
      'text/html; charset=utf-8',
      shell(p || 'repo', `<h1>${esc(p || 'repo')}</h1><ul>${items.join('')}</ul>`),
    );
  }
  const ext = extname(full).toLowerCase();
  if (ext === '.md')
    return send(res, 200, 'text/html; charset=utf-8', shell(p, marked.parse(redact(readFileSync(full, 'utf8')))));
  if (TYPES[ext]) return send(res, 200, TYPES[ext], readFileSync(full));
  return send(res, 200, 'text/plain; charset=utf-8', redact(readFileSync(full, 'utf8'))); // logs, JSON, YAML, scripts
}

// ---------------------------------------------------------------- HTTP

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
};
const redirect = (res, to) => {
  res.writeHead(302, { Location: to });
  res.end();
};
const json = (res, code, data) => send(res, code, 'application/json', JSON.stringify(data));

// Reads a small JSON request body.
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => {
      b += d;
      if (b.length > 10000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });

const server = createServer(async (req, res) => {
  // Only this machine, only this page: localhost Host header; POSTs need JSON from the same origin.
  if (!HOSTS.has(req.headers.host)) return send(res, 403, 'text/plain', 'Forbidden host');
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (
      (origin && !HOSTS.has(origin.replace(/^https?:\/\//, ''))) ||
      !/^application\/json/.test(req.headers['content-type'] || '')
    )
      return send(res, 403, 'text/plain', 'Forbidden');
  }
  const url = new URL(req.url, `http://${req.headers.host}`);

  // The page itself.
  if (req.method === 'GET' && url.pathname === '/')
    return send(
      res,
      200,
      'text/html; charset=utf-8',
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html')),
    );

  // Full state: steps, options, current job, latest runs, deliverables.
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, state());

  // Live updates (Server-Sent Events): the job after every change, and every console line.
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: job\ndata: ${JSON.stringify(publicJob())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  // Start a job: only known step IDs, run in the fixed STEPS order; one job at a time.
  if (req.method === 'POST' && url.pathname === '/api/run') {
    if (job && !job.finished) return json(res, 409, { error: 'A job is already running.' });
    if (!existsSync(join(ROOT, '.env')))
      return json(res, 400, { error: 'No .env found: copy .env.example to .env and fill in the test users.' });
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: 'Bad request' });
    }
    let ids = STEPS.map((s) => s.id).filter((id) => (body.steps || []).includes(id));
    if (ids.includes('all')) ids = ids.filter((id) => id !== 'smoke'); // "all" already includes smoke
    if (!ids.length) return json(res, 400, { error: 'Choose at least one step.' });
    const user = ['PARABANK', 'PARABANK2'].includes(body.user) ? body.user : 'PARABANK';
    const publish = !!body.publish;
    const options = { user, keep: !!body.keep || publish, publish, showBrowser: !!body.showBrowser };
    runJob(ids, options); // runs in the background; progress arrives through /api/events
    return json(res, 202, { ok: true });
  }

  // Stop: end the running step's whole process group; remaining steps are skipped.
  if (req.method === 'POST' && url.pathname === '/api/stop') {
    if (!job || job.finished) return json(res, 409, { error: 'Nothing is running.' });
    job.stopping = true;
    if (job.child) {
      try {
        process.kill(-job.child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    return json(res, 200, { ok: true });
  }

  // Read-only file viewer for reports, logs, evidence and deliverables.
  if (req.method === 'GET' && url.pathname.startsWith('/view/')) return view(res, url.pathname.slice(6));

  send(res, 404, 'text/plain', 'Not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`Test runner: http://127.0.0.1:${PORT}  (Ctrl+C to stop)`));
