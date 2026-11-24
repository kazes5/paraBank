# BUG-004 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:50:25.054Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-02, WDR-02, BILL-02 (6 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: transfer the exact balance of T to S | `POST /transfer?fromAccountId=99369&toAccountId=99258&amount=102.00` | 200 | Successfully transferred $102.00 from account #99369 to account #99258 | 99258: 101 → 203; 99369: 102 → 0 | T = 0.00 |
| 2 | fail | Transfer 0.01 more than T holds (T = 0.00) | `POST /transfer?fromAccountId=99369&toAccountId=99258&amount=0.01` | 200 | Successfully transferred $0.01 from account #99369 to account #99258 | 99258: 203 → 203.01; 99369: 0 → -0.01 | 4xx, nothing moves |
| 3 | fail | Withdraw 1000.00 from T | `POST /withdraw?accountId=99369&amount=1000` | 200 | Successfully withdrew $1000 from account #99369 | 99369: -0.01 → -1000.01 | 4xx, nothing moves |
| 4 | fail | Bill pay 1000.00 from T | `POST /billpay?accountId=99369&amount=1000` body `{"name":"City Utilities","address":{"street":"1 Main St","city":"Springfield","state":"IL","zipCode":"62701"},"phoneNumber":"5550100","accountNumber":99258}` | 200 | {"payeeName":"City Utilities","amount":1000,"accountId":99369} | 99369: -1000.01 → -2000.01 | 4xx, nothing moves |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
