# BUG-015 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:09:47.554Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: HIST-01, LOAN-01, JRN-01 J13a (4 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Transaction list: type of the date field | `GET /accounts/22557/transactions` | 200 | [{"id":64981,"accountId":22557,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":65314,"accountId":22557,"type":"Debit","date":1795478400000,"amount":1.00,"description":" | — | Transaction.date as date-time string (Swagger) |
| 2 | fail | LoanResponse.responseDate type (same call as BUG-006) | `POST /requestLoan?customerId=16541&amount=500&downPayment=50&fromAccountId=22557` | 200 | {"responseDate":1795522229153,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":22890} | 22557: 203.01 → 153.01 | responseDate as date-time string (Swagger) |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
