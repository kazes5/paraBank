# Manual tests — run 2026-11-24T10-30-26Z-manual

Executed with a visible Chrome window (Playwright, channel "chrome"); every step has a captioned screenshot. API calls were sent from the browser and shown as evidence cards. Passwords and SSNs are redacted. NFR-02 (load test) is not manual: it runs in Stage 5.

| ID | Title | Verdict | Observation | Screenshots |
|---|---|---|---|---|
| AUTH-03 | Password sent in the URL | **FAIL** | Rule A6 not met: the only API login is GET /login/{username}/{password}, so the password travels in the URL path (server answered 400 "Invalid username and/or password" to the wrong password, proving it reads it from the path). The Swagger page documents this path. Candidate defect (design). | `screenshots/01-AUTH-03-swagger.png`<br>`screenshots/02-AUTH-03-wrong-password.png` |
| AUTH-05 | Injection in username | **BLOCKED** | The site firewall (Cloudflare) answered 403 before the request reached ParaBank, so the API itself could not be tested. Not a ParaBank result; re-test on a local instance. | `screenshots/03-AUTH-05-injection.png` |
| TRF-08 | Same transfer sent twice | **NEEDS-CLARIFICATION** | Open (Q13): the identical transfer was booked twice — 15564: 287.5 → 285.5, 15675: 200 → 202. No duplicate warning was shown. Whether duplicates should be blocked is a product decision. | `screenshots/04-TRF-08-login.png`<br>`screenshots/05-TRF-08-customer.png`<br>`screenshots/06-TRF-08-accounts-before.png`<br>`screenshots/07-TRF-08-form-1.png`<br>`screenshots/08-TRF-08-result-1.png`<br>`screenshots/09-TRF-08-form-2.png`<br>`screenshots/10-TRF-08-result-2.png`<br>`screenshots/11-TRF-08-activity.png`<br>`screenshots/12-TRF-08-accounts-after.png` |
| TRF-09 | Amount below one cent (throwaway user) | **FAIL** | Rule A5/A8: transfer of 0.005 answered 200 "Successfully transferred $0.005 from account #1911"; afterwards account 19116 → 500, account 19227 → 500, account list → 500. The accounts can no longer be read (reproduces Stage 1 E1). Throwaway user qa_t09_mwuk0loi (customer 14765) is left broken; the .env users were not touched. | `screenshots/13-TRF-09-register.png`<br>`screenshots/14-TRF-09-open-form.png`<br>`screenshots/15-TRF-09-opened.png`<br>`screenshots/16-TRF-09-customer.png`<br>`screenshots/17-TRF-09-accounts-before.png`<br>`screenshots/18-TRF-09-transfer-0.01.png`<br>`screenshots/19-TRF-09-transfer-0.005.png`<br>`screenshots/20-TRF-09-read-x.png`<br>`screenshots/21-TRF-09-read-y.png`<br>`screenshots/22-TRF-09-read-list.png`<br>`screenshots/23-TRF-09-ui-overview.png`<br>`screenshots/24-TRF-09-ui-activity.png` |

## API calls

| Case | Step | Request | Status | ms |
|---|---|---|---|---|
| AUTH-03 | wrong-password | `GET /login/<USERNAME>/NotMyRealPassword-123` | 400 | 800 |
| AUTH-05 | injection | `GET /login/'%20OR%20'1'%3D'1/x` | 403 | 102 |
| TRF-08 | customer | `GET /login/<USERNAME>/<REDACTED>` | 200 | 783 |
| TRF-08 | accounts-before | `GET /customers/13877/accounts` | 200 | 251 |
| TRF-08 | accounts-after | `GET /customers/13877/accounts` | 200 | 248 |
| TRF-09 | customer | `GET /login/qa_t09_mwuk0loi/<REDACTED>` | 200 | 233 |
| TRF-09 | accounts-before | `GET /customers/14765/accounts` | 200 | 251 |
| TRF-09 | transfer-0.01 | `POST /transfer?fromAccountId=19116&toAccountId=19227&amount=0.01` | 200 | 247 |
| TRF-09 | transfer-0.005 | `POST /transfer?fromAccountId=19116&toAccountId=19227&amount=0.005` | 200 | 323 |
| TRF-09 | read-x | `GET /accounts/19116` | 500 | 250 |
| TRF-09 | read-y | `GET /accounts/19227` | 500 | 292 |
| TRF-09 | read-list | `GET /customers/14765/accounts` | 500 | 234 |
