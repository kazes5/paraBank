# BUG-007 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:09:04.172Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: BILL-03 (3 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: bill pay 1.00 with full payee | `POST /billpay?accountId=22557&amount=1` body `{"name":"City Utilities","address":{"street":"1 Main St","city":"Springfield","state":"IL","zipCode":"62701"},"phoneNumber":"5550100","accountNumber":22668}` | 200 | {"payeeName":"City Utilities","amount":1,"accountId":22557} | 22557: 104 → 103 | S −1, BillPayResult |
| 2 | fail | Bill pay 1.00 with empty payee {} | `POST /billpay?accountId=22557&amount=1` body `{}` | 200 | {"payeeName":null,"amount":1,"accountId":22557} | 22557: 103 → 102 | 4xx, no money taken |
| 3 | state | Transactions of S with amount 1.00 | `GET /accounts/22557/transactions/amount/1` | 200 | [{"id":65314,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":"Funds Transfer Sent"},{"id":65536,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":"Funds T | — | no "Bill Payment to null" row |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
