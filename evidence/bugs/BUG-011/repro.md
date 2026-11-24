# BUG-011 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:08:57.260Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-05 (2 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Transfer 1.00 S → S | `POST /transfer?fromAccountId=22557&toAccountId=22557&amount=1` | 200 | Successfully transferred $1 from account #22557 to account #22557 | 22557: 104 → 104 | 4xx |
| 2 | state | Transactions of S with amount 1.00 | `GET /accounts/22557/transactions/amount/1` | 200 | [{"id":65314,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":"Funds Transfer Sent"},{"id":65536,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":"Funds T | — | no rows from the S → S transfer |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
