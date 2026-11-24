# BUG-014 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:50:04.087Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: HIST-05 (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: onDate in MM-dd-yyyy | `GET /accounts/99258/transactions/onDate/11-23-2026` | 200 | [{"id":152560,"accountId":99258,"type":"Credit","date":1795392000000,"amount":100.00,"description":"Funds Transfer Received"},{"id":152893,"accountId":99258,"type":"Debit","date":1795392000000,"amount":1.00,"description" | — | today's rows |
| 2 | fail | onDate in ISO yyyy-MM-dd | `GET /accounts/99258/transactions/onDate/2026-11-23` | 200 | [] | — | 400 with a message (or the same rows) |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
