# BUG-011 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:49:16.878Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-05 (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Transfer 1.00 S → S | `POST /transfer?fromAccountId=99258&toAccountId=99258&amount=1` | 200 | Successfully transferred $1 from account #99258 to account #99258 | 99258: 104 → 104 | 4xx |
| 2 | state | Transactions of S with amount 1.00 | `GET /accounts/99258/transactions/amount/1` | 200 | [{"id":152893,"accountId":99258,"type":"Debit","date":1795392000000,"amount":1.00,"description":"Funds Transfer Sent"},{"id":153115,"accountId":99258,"type":"Debit","date":1795392000000,"amount":1.00,"description":"Funds | — | no rows from the S → S transfer |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
