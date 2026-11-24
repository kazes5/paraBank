// Ensures the ParaBank test user exists, using details from .env:
//   1. Try to log in through the web UI.
//   2. Only if login fails, (re-)register the user through the web UI.
//   3. After registering, log in again to confirm the account works.
//
// Security:
//  - All values come from environment variables (loaded from the git-ignored .env).
//  - Uses the Playwright library directly: no traces, videos or screenshots are recorded,
//    so typed passwords/SSNs are never written to disk.
//  - Only the username and the outcome are printed; password and SSN never are.
//
// Usage: node scripts/register-user.mjs   (normally via ./run-all.sh)

import { chromium } from 'playwright';

// Every .env value the registration form needs; stop with a list of what is missing.
const REQUIRED = [
  'WEB_UI_URL',
  'PARABANK_USERNAME',
  'PARABANK_PASSWORD',
  'PARABANK_SSN',
  'PARABANK_FIRST_NAME',
  'PARABANK_LAST_NAME',
  'PARABANK_STREET',
  'PARABANK_CITY',
  'PARABANK_STATE',
  'PARABANK_ZIP',
  'PARABANK_PHONE',
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(2);
}

const env = process.env;
const base = new URL('.', env.WEB_UI_URL).href; // .../parabank/
const user = env.PARABANK_USERNAME;

const browser = await chromium.launch({ headless: !process.env.HEADED });
const context = await browser.newContext(); // fresh profile: no saved logins or autofill
const page = await context.newPage();

// Fills and submits the web registration form; success = the "created successfully" page.
async function register() {
  await page.goto(new URL('register.htm', base).href);
  const fields = {
    'customer.firstName': env.PARABANK_FIRST_NAME,
    'customer.lastName': env.PARABANK_LAST_NAME,
    'customer.address.street': env.PARABANK_STREET,
    'customer.address.city': env.PARABANK_CITY,
    'customer.address.state': env.PARABANK_STATE,
    'customer.address.zipCode': env.PARABANK_ZIP,
    'customer.phoneNumber': env.PARABANK_PHONE,
    'customer.ssn': env.PARABANK_SSN,
    'customer.username': user,
    'customer.password': env.PARABANK_PASSWORD,
    repeatedPassword: env.PARABANK_PASSWORD,
  };
  for (const [id, value] of Object.entries(fields)) {
    await page.fill(`[id="${id}"]`, value);
  }
  await Promise.all([page.waitForLoadState('load'), page.click('input[value="Register"]')]);
  const body = await page.locator('#rightPanel').innerText();
  if (/created successfully/i.test(body)) return;
  if (/username already exists/i.test(body)) {
    throw new Error(
      `Login failed, but "${user}" already exists, so it can't be re-created. ` +
        'The password in .env is probably wrong: fix PARABANK_PASSWORD, or use a new PARABANK_USERNAME.',
    );
  }
  const errors = await page.locator('#rightPanel .error').allInnerTexts();
  throw new Error(`Registration failed: ${errors.join('; ') || 'unexpected page'}`);
}

// Returns true if the .env credentials log in through the web UI.
// Logs in through the web form; true when the account overview appears.
async function canLogin() {
  await context.clearCookies(); // start logged out
  await page.goto(new URL('index.htm', base).href);
  await page.fill('input[name="username"]', user);
  await page.fill('input[name="password"]', env.PARABANK_PASSWORD);
  await Promise.all([page.waitForLoadState('load'), page.click('input[value="Log In"]')]);
  const ok = (await page.locator('a[href*="logout.htm"]').count()) > 0;
  if (ok) await page.goto(new URL('logout.htm', base).href);
  return ok;
}

// Main: log in, register only if that fails, then confirm the login works. Always closes the browser.
try {
  if (await canLogin()) {
    console.log(`"${user}" exists; login works. No registration needed.`);
  } else {
    console.log(`Login for "${user}" failed; re-registering via the web UI...`);
    await register();
    if (!(await canLogin())) throw new Error(`Registered "${user}", but login still fails.`);
    console.log(`Registered "${user}" and confirmed login works.`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
