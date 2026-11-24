# Manual tests — run 2026-11-23T16-35-57-067Z

> **Screenshots removed (2026-11-24):** they showed the test user's personal profile. The same steps with masked screenshots are in [`2026-11-24T10-30-26Z-manual`](../2026-11-24T10-30-26Z-manual/summary.md). The verdicts and the text evidence below are unchanged.

Executed with a visible Chrome window (Playwright, channel "chrome"); every step has a captioned screenshot. API calls were sent from the browser and shown as evidence cards. Passwords and SSNs are redacted. NFR-02 (load test) is not manual: it runs in Stage 5.

| ID | Title | Verdict | Observation | Screenshots |
|---|---|---|---|---|
| AUTH-03 | Password sent in the URL | **FAIL** | Rule A6 not met: the only API login is GET /login/{username}/{password}, so the password travels in the URL path (server answered 400 "Invalid username and/or password" to the wrong password, proving it reads it from the path). The Swagger page documents this path. Candidate defect (design). | `01-AUTH-03-swagger.png` *(removed)*<br>`02-AUTH-03-wrong-password.png` *(removed)* |
| AUTH-05 | Injection in username | **BLOCKED** | The site firewall (Cloudflare) answered 403 before the request reached ParaBank, so the API itself could not be tested. Not a ParaBank result; re-test on a local instance. | `03-AUTH-05-injection.png` *(removed)* |
| TRF-08 | Same transfer sent twice | **NEEDS-CLARIFICATION** | Open (Q13): the identical transfer was booked twice — 54192: 4047.5 → 4045.5, 54414: 104 → 106. No duplicate warning was shown. Whether duplicates should be blocked is a product decision. | `04-TRF-08-login.png` *(removed)*<br>`05-TRF-08-customer.png` *(removed)*<br>`06-TRF-08-accounts-before.png` *(removed)*<br>`07-TRF-08-form-1.png` *(removed)*<br>`08-TRF-08-result-1.png` *(removed)*<br>`09-TRF-08-form-2.png` *(removed)*<br>`10-TRF-08-result-2.png` *(removed)*<br>`11-TRF-08-activity.png` *(removed)*<br>`12-TRF-08-accounts-after.png` *(removed)* |
| TRF-09 | Amount below one cent (throwaway user) | **FAIL** | Rule A5/A8: transfer of 0.005 answered 200 "Successfully transferred $0.005 from account #8971"; afterwards account 89712 → 500, account 89823 → 500, account list → 500. The accounts can no longer be read (reproduces Stage 1 E1). Throwaway user qa_t09_mwthmtg3 (customer 54947) is left broken; the .env users were not touched. | `13-TRF-09-register.png` *(removed)*<br>`14-TRF-09-open-form.png` *(removed)*<br>`15-TRF-09-opened.png` *(removed)*<br>`16-TRF-09-customer.png` *(removed)*<br>`17-TRF-09-accounts-before.png` *(removed)*<br>`18-TRF-09-transfer-0.01.png` *(removed)*<br>`19-TRF-09-transfer-0.005.png` *(removed)*<br>`20-TRF-09-read-x.png` *(removed)*<br>`21-TRF-09-read-y.png` *(removed)*<br>`22-TRF-09-read-list.png` *(removed)*<br>`23-TRF-09-ui-overview.png` *(removed)*<br>`24-TRF-09-ui-activity.png` *(removed)* |

## API calls

| Case | Step | Request | Status | ms |
|---|---|---|---|---|
| AUTH-03 | wrong-password | `GET /login/<USERNAME>/NotMyRealPassword-123` | 400 | 749 |
| AUTH-05 | injection | `GET /login/'%20OR%20'1'%3D'1/x` | 403 | 87 |
| TRF-08 | customer | `GET /login/<USERNAME>/<REDACTED>` | 200 | 772 |
| TRF-08 | accounts-before | `GET /customers/37409/accounts` | 200 | 238 |
| TRF-08 | accounts-after | `GET /customers/37409/accounts` | 200 | 223 |
| TRF-09 | customer | `GET /login/qa_t09_mwthmtg3/<REDACTED>` | 200 | 233 |
| TRF-09 | accounts-before | `GET /customers/54947/accounts` | 200 | 251 |
| TRF-09 | transfer-0.01 | `POST /transfer?fromAccountId=89712&toAccountId=89823&amount=0.01` | 200 | 236 |
| TRF-09 | transfer-0.005 | `POST /transfer?fromAccountId=89712&toAccountId=89823&amount=0.005` | 200 | 244 |
| TRF-09 | read-x | `GET /accounts/89712` | 500 | 303 |
| TRF-09 | read-y | `GET /accounts/89823` | 500 | 222 |
| TRF-09 | read-list | `GET /customers/54947/accounts` | 500 | 312 |
