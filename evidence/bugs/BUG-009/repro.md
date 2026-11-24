# BUG-009 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:09:52.741Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: JRN-01 J06b (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Open a new CHECKING account from A | `POST /createAccount?customerId=16541&newAccountType=0&fromAccountId=22446` | 200 | {"id":22779,"customerId":16541,"type":"CHECKING","balance":0} | 22446: 315.5 → 215.5 | response balance = real balance |
| 2 | state | Read the new account | `GET /accounts/22779` | 200 | {"id":22779,"customerId":16541,"type":"CHECKING","balance":100.00} | — | same balance as the create response |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
