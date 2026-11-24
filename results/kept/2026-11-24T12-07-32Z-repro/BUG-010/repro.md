# BUG-010 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:08:39.962Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-04, DEP-02, WDR-04 (7 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Transfer 0.00 S → T | `POST /transfer?fromAccountId=22557&toAccountId=22668&amount=0` | 200 | Successfully transferred $0 from account #22557 to account #22668 | 22557: 104 → 104; 22668: 101 → 101 | 4xx, no transaction |
| 2 | fail | Deposit 0.00 into S | `POST /deposit?accountId=22557&amount=0` | 200 | Successfully deposited $0 to account #22557 | 22557: 104 → 104 | 4xx, no transaction |
| 3 | fail | Withdraw 0.00 from S | `POST /withdraw?accountId=22557&amount=0` | 200 | Successfully withdrew $0 from account #22557 | 22557: 104 → 104 | 4xx, no transaction |
| 4 | state | Transactions of S: 0.00 rows recorded? | `GET /accounts/22557/transactions/amount/0` | 200 | [{"id":66535,"accountId":22557,"type":"Debit","date":1795478400000,"amount":0.00,"description":"Funds Transfer Sent"},{"id":66757,"accountId":22557,"type":"Credit","date":1795478400000,"amount":0.00,"description":"Deposi | — | no 0.00 rows |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
