# BUG-002 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:07:42.753Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: CUST-03, ACCT-04 (2 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Profile of the customer, no cookie or credentials | `GET /customers/16541` | 200 | {"id":16541,"firstName":"QA","lastName":"Throwaway","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phoneNumber":"5550000","ssn":"<REDACTED>"} | — | 401/403, no data |
| 2 | fail | Account of the customer, no cookie or credentials | `GET /accounts/22557` | 200 | {"id":22557,"customerId":16541,"type":"CHECKING","balance":100.00} | — | 401/403, no data |
| 3 | fail | Transfer 1.00 S → T with no cookie or credentials | `POST /transfer?fromAccountId=22557&toAccountId=22668&amount=1` | 200 | Successfully transferred $1 from account #22557 to account #22668 | 22557: 100 → 99; 22668: 100 → 101 | 401/403, nothing moves |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
