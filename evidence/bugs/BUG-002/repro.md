# BUG-002 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:48:01.432Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: CUST-03, ACCT-04 (2 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Profile of the customer, no cookie or credentials | `GET /customers/60497` | 200 | {"id":60497,"firstName":"QA","lastName":"Stage4","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phoneNumber":"5550000","ssn":"<REDACTED>"} | — | 401/403, no data |
| 2 | fail | Account of the customer, no cookie or credentials | `GET /accounts/99258` | 200 | {"id":99258,"customerId":60497,"type":"CHECKING","balance":100.00} | — | 401/403, no data |
| 3 | fail | Transfer 1.00 S → T with no cookie or credentials | `POST /transfer?fromAccountId=99258&toAccountId=99369&amount=1` | 200 | Successfully transferred $1 from account #99258 to account #99369 | 99258: 100 → 99; 99369: 100 → 101 | 401/403, nothing moves |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
