# BUG-009 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:50:12.829Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: JRN-01 J06b (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Open a new CHECKING account from A | `POST /createAccount?customerId=60497&newAccountType=0&fromAccountId=99147` | 200 | {"id":102588,"customerId":60497,"type":"CHECKING","balance":0} | 99147: 315.5 → 215.5 | response balance = real balance |
| 2 | state | Read the new account | `GET /accounts/102588` | 200 | {"id":102588,"customerId":60497,"type":"CHECKING","balance":100.00} | — | same balance as the create response |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
