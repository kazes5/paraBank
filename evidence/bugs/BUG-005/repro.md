# BUG-005 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:51:03.724Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: LOAN-04 (2 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Request loan 1000 with down payment 253.01 (S holds 153.01) | `POST /requestLoan?customerId=60497&amount=1000&downPayment=253.01&fromAccountId=99258` | 200 | {"responseDate":1795452662041,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":102921} | 99258: 153.01 → -100 | denied, nothing changes |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
