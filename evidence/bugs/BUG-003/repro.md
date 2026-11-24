# BUG-003 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:08:03.601Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-03, DEP-03, WDR-03, BILL-04 (13 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: transfer 1.00 S → T | `POST /transfer?fromAccountId=22557&toAccountId=22668&amount=1` | 200 | Successfully transferred $1 from account #22557 to account #22668 | 22557: 99 → 98; 22668: 101 → 102 | S −1, T +1 |
| 2 | fail | Transfer −1.00 S → T | `POST /transfer?fromAccountId=22557&toAccountId=22668&amount=-1` | 200 | Successfully transferred $-1 from account #22557 to account #22668 | 22557: 98 → 99; 22668: 102 → 101 | 4xx, nothing moves |
| 3 | fail | Deposit −5.00 into S | `POST /deposit?accountId=22557&amount=-5` | 200 | Successfully deposited $-5 to account #22557 | 22557: 99 → 94 | 4xx, nothing moves |
| 4 | fail | Withdraw −5.00 from S | `POST /withdraw?accountId=22557&amount=-5` | 200 | Successfully withdrew $-5 from account #22557 | 22557: 94 → 99 | 4xx, nothing moves |
| 5 | fail | Bill pay −5.00 from S | `POST /billpay?accountId=22557&amount=-5` body `{"name":"City Utilities","address":{"street":"1 Main St","city":"Springfield","state":"IL","zipCode":"62701"},"phoneNumber":"5550100","accountNumber":22668}` | 200 | {"payeeName":"City Utilities","amount":-5,"accountId":22557} | 22557: 99 → 104; 22668: 101 → 101 | 4xx, nothing moves |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
