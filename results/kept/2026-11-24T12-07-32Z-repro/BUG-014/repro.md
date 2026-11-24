# BUG-014 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:09:44.089Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: HIST-05 (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: onDate in MM-dd-yyyy | `GET /accounts/22557/transactions/onDate/11-24-2026` | 200 | [{"id":64981,"accountId":22557,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":65314,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":" | — | today's rows |
| 2 | fail | onDate in ISO yyyy-MM-dd | `GET /accounts/22557/transactions/onDate/2026-11-24` | 200 | [] | — | 400 with a message (or the same rows) |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
