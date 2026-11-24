// Manual test cases (STD.md §5.8): AUTH-03, AUTH-05, TRF-08, TRF-09 — run in a visible Chrome
// window with a captioned screenshot for every step.
//
// - Web UI steps are real browser interactions; API steps are sent from the browser context and
//   shown as an evidence card (request, status, body) so every call has a screenshot.
// - AUTH-03 uses a deliberately wrong password: it proves the password travels in the URL without
//   putting the real one in a screenshot.
// - TRF-09 breaks the accounts it touches (Stage 1, E1), and with them the customer's account list,
//   so it runs on a throwaway user registered by this script, never on the .env users.
// - Passwords and SSNs are redacted from every card, log and report.
//
// Output: results/runs/<runId>-manual/ (summary.md, results.json, screenshots/NN-<case>-<step>.png)
// Usage:  ./run.sh manual [AUTH-03 AUTH-05 TRF-08 TRF-09] [--headless]
//         HEADLESS=1 to run without a window

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { BASE, API, readUser, redact, addSecret, newRun, rebuildIndex } from './lib/common.mjs';

const ALL = ['AUTH-03', 'AUTH-05', 'TRF-08', 'TRF-09'];
const selected = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const web = BASE;
const api = API;
const user = readUser('PARABANK');
const runFolder = newRun('manual', { user: user.username, scope: selected.join(', ') });
const runId = runFolder.id;
const OUT = runFolder.sub('screenshots');

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cents = (x) => Math.round(Number(x) * 100);

const browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.HEADLESS, slowMo: process.env.HEADLESS ? 0 : 250 });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();

let n = 0;
const results = [];
let current;

// Caption bar on top of the page, then a full-page screenshot
async function shot(step, caption) {
  await page.evaluate(([id, text, at]) => {
    document.getElementById('qa-caption')?.remove();
    const d = document.createElement('div');
    d.id = 'qa-caption';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1b2a41;color:#fff;font:13px/1.4 -apple-system,Segoe UI,sans-serif;padding:8px 14px;box-shadow:0 2px 6px rgba(0,0,0,.3)';
    d.textContent = `${id} · ${text} · ${at}`;
    document.body.appendChild(d);
    document.body.style.paddingTop = '40px';
  }, [current.id, redact(caption), new Date().toISOString()]);
  const file = `${String(++n).padStart(2, '0')}-${current.id}-${step}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  current.screenshots.push(file);
  await page.evaluate(() => { document.getElementById('qa-caption')?.remove(); document.body.style.paddingTop = ''; });
}

// API call from the browser context, shown as an evidence card
async function apiCall(step, caption, method, path, { query, data } = {}) {
  await sleep(1500); // site rate limit (O6)
  const url = new URL(api + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const t0 = Date.now();
  const res = await page.request.fetch(url.toString(), { method, headers: { Accept: 'application/json' }, data, failOnStatusCode: false });
  const ms = Date.now() - t0;
  const body = await res.text();
  let pretty = body;
  try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch { /* text or HTML */ }
  const rec = { step, method, url: redact(url.toString()), status: res.status(), ms, body: redact(body).slice(0, 3000) };
  current.calls.push(rec);
  await page.setContent(`<!doctype html><html><body style="margin:0;font:14px -apple-system,Segoe UI,sans-serif;background:#f4f6f9">
    <div style="max-width:1100px;margin:30px auto;background:#fff;border:1px solid #d5dbe3;border-radius:6px;padding:20px 24px">
      <div style="color:#5b6b7f;font-size:12px;text-transform:uppercase;letter-spacing:.05em">API evidence · ${esc(current.id)}</div>
      <h2 style="margin:6px 0 14px;font-size:18px">${esc(redact(caption))}</h2>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#f0f3f7;padding:10px;border-radius:4px;word-break:break-all"><b>${method}</b> ${esc(rec.url)}${data !== undefined ? `<br><br>${esc(redact(typeof data === 'string' ? data : JSON.stringify(data)))}` : ''}</div>
      <p style="margin:14px 0 6px"><b>Status:</b> <span style="color:${res.status() < 300 ? '#1a7f37' : '#cf222e'}">${res.status()} ${esc(res.statusText())}</span> · ${ms} ms · ${esc(new Date().toISOString())}</p>
      <pre style="font-size:12px;background:#0d1117;color:#e6edf3;padding:12px;border-radius:4px;white-space:pre-wrap;max-height:560px;overflow:hidden">${esc(redact(pretty).slice(0, 2500))}</pre>
    </div></body></html>`);
  await shot(step, caption);
  return { status: res.status(), body, json: (() => { try { return JSON.parse(body); } catch { return undefined; } })() };
}

async function uiLogin(u) {
  await page.goto(`${web}/index.htm`);
  await page.fill('input[name="username"]', u.username);
  await page.fill('input[name="password"]', u.password);
  await Promise.all([page.waitForNavigation(), page.click('input[type="submit"][value="Log In"]')]);
  await page.waitForSelector('text=Welcome', { timeout: 10000 });
}
async function uiLogout() { await page.goto(`${web}/logout.htm`).catch(() => {}); }

async function run(id, title, fn) {
  if (!selected.includes(id)) return;
  current = { id, title, verdict: '', observation: '', screenshots: [], calls: [] };
  console.log(`\n== ${id} ${title}`);
  try { await fn(); } catch (err) {
    current.verdict = current.verdict || 'BLOCKED';
    current.observation += ` Script error: ${redact(err.message)}`;
    await shot('error', `script error: ${err.message.slice(0, 120)}`).catch(() => {});
  }
  console.log(`   ${current.verdict}: ${current.observation}`);
  results.push(current);
}

// ---------------------------------------------------------------- AUTH-03

await run('AUTH-03', 'Password sent in the URL', async () => {
  await page.goto('https://parabank.parasoft.com/parabank/api-docs/index.html').catch(() => {});
  await page.waitForTimeout(2500);
  const docText = await page.textContent('body').catch(() => '');
  await shot('swagger', 'API documentation: GET /login/{username}/{password} — credentials are part of the URL path');
  const r = await apiCall('wrong-password', 'Login with a deliberately wrong password: the password is in the request path, visible to proxies, logs and browser history',
    'GET', `/login/${encodeURIComponent(user.username)}/NotMyRealPassword-123`);
  current.verdict = 'FAIL';
  current.observation = `Rule A6 not met: the only API login is GET /login/{username}/{password}, so the password travels in the URL path (server answered ${r.status} "${r.body.slice(0, 40)}" to the wrong password, proving it reads it from the path).${/login\/\{username\}\/\{password\}/.test(docText) ? ' The Swagger page documents this path.' : ''} Candidate defect (design).`;
});

// ---------------------------------------------------------------- AUTH-05

await run('AUTH-05', 'Injection in username', async () => {
  const r = await apiCall('injection', "Login with username ' OR '1'='1 (one request, own test only)", 'GET', `/login/${encodeURIComponent("' OR '1'='1")}/x`);
  const waf = r.status === 403 && /cloudflare|attention required|blocked/i.test(r.body);
  const leaked = r.json && r.json.id !== undefined;
  if (waf) { current.verdict = 'BLOCKED'; current.observation = 'The site firewall (Cloudflare) answered 403 before the request reached ParaBank, so the API itself could not be tested. Not a ParaBank result; re-test on a local instance.'; }
  else if (leaked) { current.verdict = 'FAIL'; current.observation = `Rule A8/A9 not met: customer data returned (HTTP ${r.status}).`; }
  else if (r.status >= 500) { current.verdict = 'FAIL'; current.observation = `Rule A8 not met: server error ${r.status}.`; }
  else { current.verdict = r.status >= 400 ? 'PASS' : 'NEEDS-CLARIFICATION'; current.observation = `HTTP ${r.status}, no customer data: "${r.body.slice(0, 60)}".`; }
});

// ---------------------------------------------------------------- TRF-08

await run('TRF-08', 'Same transfer sent twice', async () => {
  await uiLogin(user);
  await shot('login', `logged in to the web UI as ${user.username}`);
  const custId = (await apiCall('customer', 'Look up the customer and accounts', 'GET', `/login/${encodeURIComponent(user.username)}/${encodeURIComponent(user.password)}`)).json.id;
  const accts = (await apiCall('accounts-before', 'Balances before', 'GET', `/customers/${custId}/accounts`)).json;
  const [from, to] = accts.map((a) => a.id).sort((a, b) => a - b);
  const before = Object.fromEntries(accts.map((a) => [a.id, cents(a.balance)]));
  const transferUi = async (k) => {
    await page.goto(`${web}/transfer.htm`);
    await page.waitForFunction(() => document.querySelectorAll('#fromAccountId option').length > 0);
    await page.fill('#amount', '1.00');
    await page.selectOption('#fromAccountId', String(from));
    await page.selectOption('#toAccountId', String(to));
    await shot(`form-${k}`, `Transfer Funds form, attempt ${k}: 1.00 from ${from} to ${to}`);
    await page.click('input[type="submit"][value="Transfer"]');
    await page.waitForSelector('#showResult', { state: 'visible', timeout: 10000 });
    await shot(`result-${k}`, `attempt ${k}: result page`);
  };
  await transferUi(1);
  await transferUi(2);
  await page.goto(`${web}/activity.htm?id=${from}`);
  await page.waitForTimeout(2500);
  await shot('activity', `account ${from} activity after two identical transfers`);
  const after = Object.fromEntries((await apiCall('accounts-after', 'Balances after', 'GET', `/customers/${custId}/accounts`)).json.map((a) => [a.id, cents(a.balance)]));
  const d = after[from] - before[from];
  current.verdict = 'NEEDS-CLARIFICATION';
  current.observation = `Open (Q13): the identical transfer was booked ${d === -200 ? 'twice' : `with a net change of ${d} cents`} — ${from}: ${before[from] / 100} → ${after[from] / 100}, ${to}: ${before[to] / 100} → ${after[to] / 100}. No duplicate warning was shown. Whether duplicates should be blocked is a product decision.`;
  await uiLogout();
});

// ---------------------------------------------------------------- TRF-09

await run('TRF-09', 'Amount below one cent (throwaway user)', async () => {
  const tag = Date.now().toString(36);
  const tmp = {
    username: `qa_t09_${tag}`, password: `Tmp-${randomBytes(6).toString('hex')}`, ssn: String(randomInt(100000000, 999999999)),
  };
  addSecret(tmp.password, tmp.ssn);
  await page.goto(`${web}/register.htm`);
  const fields = { firstName: 'QA', lastName: 'Throwaway', 'address.street': '1 Test St', 'address.city': 'Testville', 'address.state': 'TS', 'address.zipCode': '00000', phoneNumber: '5550000', ssn: tmp.ssn };
  for (const [k, v] of Object.entries(fields)) await page.fill(`input[name="customer.${k}"]`, v);
  await page.fill('input[name="customer.username"]', tmp.username);
  await page.fill('input[name="customer.password"]', tmp.password);
  await page.fill('input[name="repeatedPassword"]', tmp.password);
  await Promise.all([page.waitForNavigation(), page.click('input[type="submit"][value="Register"]')]);
  await shot('register', `registered throwaway user ${tmp.username} (TRF-09 breaks the accounts it touches)`);
  await page.goto(`${web}/openaccount.htm`);
  await page.waitForFunction(() => document.querySelectorAll('#fromAccountId option').length > 0);
  await page.selectOption('#type', '0');
  await shot('open-form', 'Open New Account: second CHECKING account');
  await page.click('input[value="Open New Account"]');
  await page.waitForSelector('#newAccountId', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await shot('opened', 'second account opened');
  const custId = (await apiCall('customer', 'Look up the throwaway customer', 'GET', `/login/${tmp.username}/${encodeURIComponent(tmp.password)}`)).json.id;
  const [x, y] = (await apiCall('accounts-before', 'Accounts and balances before', 'GET', `/customers/${custId}/accounts`)).json.map((a) => a.id).sort((a, b) => a - b);
  await apiCall('transfer-0.01', 'Transfer 0.01 (smallest valid amount)', 'POST', '/transfer', { query: { fromAccountId: x, toAccountId: y, amount: '0.01' } });
  const r = await apiCall('transfer-0.005', 'Transfer 0.005 (below one cent)', 'POST', '/transfer', { query: { fromAccountId: x, toAccountId: y, amount: '0.005' } });
  const ax = await apiCall('read-x', `Read account ${x} after the 0.005 transfer`, 'GET', `/accounts/${x}`);
  const ay = await apiCall('read-y', `Read account ${y} after the 0.005 transfer`, 'GET', `/accounts/${y}`);
  const list = await apiCall('read-list', 'Read the customer account list', 'GET', `/customers/${custId}/accounts`);
  // still logged in to the web UI: registration signs the new user in
  await page.goto(`${web}/overview.htm`);
  await page.waitForTimeout(3000);
  await shot('ui-overview', 'web UI Accounts Overview after the 0.005 transfer');
  await page.goto(`${web}/activity.htm?id=${x}`);
  await page.waitForTimeout(3000);
  await shot('ui-activity', `web UI activity of account ${x} after the 0.005 transfer`);
  const broken = [ax, ay, list].filter((c) => c.status >= 500).length;
  current.verdict = r.status === 200 && broken ? 'FAIL' : r.status >= 400 && !broken ? 'PASS' : broken ? 'FAIL' : 'NEEDS-CLARIFICATION';
  current.observation = `Rule A5/A8: transfer of 0.005 answered ${r.status} "${r.body.slice(0, 50)}"; afterwards account ${x} → ${ax.status}, account ${y} → ${ay.status}, account list → ${list.status}. ${broken ? 'The accounts can no longer be read (reproduces Stage 1 E1).' : ''} Throwaway user ${tmp.username} (customer ${custId}) is left broken; the .env users were not touched.`;
  await uiLogout();
});

await browser.close();

// ---------------------------------------------------------------- report

const md = [
  `# Manual tests — run ${runId}`,
  '',
  `Executed with a visible Chrome window (Playwright, channel "chrome"); every step has a captioned screenshot. API calls were sent from the browser and shown as evidence cards. Passwords and SSNs are redacted. NFR-02 (load test) is not manual: it runs in Stage 5.`,
  '',
  '| ID | Title | Verdict | Observation | Screenshots |', '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.title} | **${r.verdict}** | ${redact(r.observation).replace(/\|/g, '\\|')} | ${r.screenshots.map((s) => `\`screenshots/${s}\``).join('<br>')} |`),
  '',
  '## API calls',
  '',
  '| Case | Step | Request | Status | ms |', '|---|---|---|---|---|',
  ...results.flatMap((r) => r.calls.map((c) => `| ${r.id} | ${c.step} | \`${c.method} ${c.url.replace(api, '')}\` | ${c.status} | ${c.ms} |`)),
  '',
];
writeFileSync(join(runFolder.dir, 'summary.md'), redact(md.join('\n')));
writeFileSync(join(runFolder.dir, 'results.json'), redact(JSON.stringify({ runId, results }, null, 2)));
const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
runFolder.update({ finished: new Date().toISOString(), counts });
rebuildIndex();
console.log(`\nRun: ${runFolder.dir}`);
