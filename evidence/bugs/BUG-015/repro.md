# BUG-015 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:50:07.576Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: HIST-01, LOAN-01, JRN-01 J13a (4 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Transaction list: type of the date field | `GET /accounts/99258/transactions` | 200 | [{"id":152560,"accountId":99258,"type":"Credit","date":1795392000000,"amount":100.00,"description":"Funds Transfer Received"},{"id":152893,"accountId":99258,"type":"Debit","date":1795392000000,"amount":1.00,"description" | — | Transaction.date as date-time string (Swagger) |
| 2 | fail | LoanResponse.responseDate type (same call as BUG-006) | `POST /requestLoan?customerId=60497&amount=500&downPayment=50&fromAccountId=99258` | 200 | {"responseDate":1795452649663,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":102810} | 99258: 203.01 → 153.01 | responseDate as date-time string (Swagger) |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
