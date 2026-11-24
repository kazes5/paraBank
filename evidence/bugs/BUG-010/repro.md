# BUG-010 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:48:59.258Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-04, DEP-02, WDR-04 (6 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Transfer 0.00 S → T | `POST /transfer?fromAccountId=99258&toAccountId=99369&amount=0` | 200 | Successfully transferred $0 from account #99258 to account #99369 | 99258: 104 → 104; 99369: 101 → 101 | 4xx, no transaction |
| 2 | fail | Deposit 0.00 into S | `POST /deposit?accountId=99258&amount=0` | 200 | Successfully deposited $0 to account #99258 | 99258: 104 → 104 | 4xx, no transaction |
| 3 | fail | Withdraw 0.00 from S | `POST /withdraw?accountId=99258&amount=0` | 200 | Successfully withdrew $0 from account #99258 | 99258: 104 → 104 | 4xx, no transaction |
| 4 | state | Transactions of S: 0.00 rows recorded? | `GET /accounts/99258/transactions/amount/0` | 200 | [{"id":153892,"accountId":99258,"type":"Debit","date":1795392000000,"amount":0.00,"description":"Funds Transfer Sent"},{"id":154114,"accountId":99258,"type":"Credit","date":1795392000000,"amount":0.00,"description":"Depo | — | no 0.00 rows |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
