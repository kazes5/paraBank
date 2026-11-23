## Scenario

You are joining the QA team of a digital bank. R&D says the bank's REST API is ready for release, and you must decide whether it really is. There is no product specification, only the API documentation and the behavior of the system. Working out what is correct is part of the task.

## The system under test

We use **ParaBank**, a public demo bank from Parasoft.

- Swagger UI: https://parabank.parasoft.com/parabank/api-docs/index.html
- OpenAPI file: https://parabank.parasoft.com/parabank/services/bank/openapi.json
- Web UI (use it to register a user and to cross-check results): https://parabank.parasoft.com/parabank/index.htm
- API base URL: `https://parabank.parasoft.com/parabank/services/bank`

**Getting started:** register your own user in the web UI. Use that user and its accounts for all your testing. No credentials are provided.

**Endpoints in scope:**
- `GET /login/{username}/{password}`
- `GET /customers/{customerId}` and `GET /customers/{customerId}/accounts`
- `GET /accounts/{accountId}`
- `GET /accounts/{accountId}/transactions` (and its filter variants)
- `POST /transfer`
- `POST /deposit` and `POST /withdraw`
- `POST /billpay`
- `POST /requestLoan`

## Ground rules

- This is a **shared public system**. Other people are using it, and its data is reset periodically. Create your own data, and do not rely on it persisting for days.
- **Do not call** `/cleanDB`, `/initializeDB`, `/setParameter`, `/startupJmsListener`, or `/shutdownJmsListener`. They affect everyone.
- Keep load tests small and short (see task 4). Do not run anything that could be considered an attack.
- Do not test other people's users or accounts.
- If the public site is unavailable, ParaBank also publishes a Docker image and a WAR file that you can run locally. Mention it in your report if you did.

## Business rules

No rules are given. Derive them from the Swagger documentation, the web UI, and the system's behavior, as you would with a new product. For example: what should happen when you transfer more than the balance, transfer a negative amount, use a closed or non-existent account, or deposit zero? Write down every rule you assume. Where the documentation, the UI, and the API disagree, report it.

---

## Tasks

### 1. Test Design Document (STD)
Write a test design document that includes:
- Scope, assumptions, and risks
- Test approach
- At least **25 prioritized test cases** covering positive, negative, boundary, security/authorization, and data-integrity scenarios
- A note on which cases you would automate and why

### 2. API test execution
Build a Postman collection (or equivalent) that:
- Uses environment variables and handles authentication
- Contains assertions on status code, response schema, and business values (the rules you derived)
- Covers at least **12** of your test cases

Export the collection and the environment.

### 3. Bug reports
Report every defect you find in a Jira-style format:
- Title
- Steps to reproduce
- Expected vs. actual result
- Severity and priority
- Evidence (request and response)

Also list any spec ambiguities or contradictions you found.

### 4. Basic load and performance test
Using JMeter, k6, Postman runner, or similar, test `POST /transfer` and `GET /accounts/{accountId}`:
- Define your own SLAs (for example, p95 response time and error rate)
- Run a baseline scenario and a higher-load scenario
- Report the results and any bottlenecks you suspect

Keep the load small and short: no more than about 20 virtual users and a few minutes per run. The system is shared and public, so do not overload it. Explain how you chose your load model, and what you could not conclude because of the limits of a shared environment.

### 5. Test Summary Report (STR)
Write a one-to-two page report for both R&D and management:
- What was tested and what was not
- Pass/fail numbers
- Open defects by severity
- Risks
- A **go / no-go recommendation** with justification

### 6. Optional bonus: automation
Automate 3-5 of your tests in code (Newman, REST Assured, pytest + requests, or similar). Include a README that explains how to run them.

---

## Deliverables checklist

- [ ] Test Design Document (STD)
- [ ] Postman collection and environment
- [ ] Bug reports and spec questions
- [ ] Load test scripts and results
- [ ] Test Summary Report (STR)
- [ ] (Optional) Automation code or repo link

Documents may be Word, PDF, Markdown, or Confluence-style pages. Please send everything in one email or a shared folder.