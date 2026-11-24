# BUG-006 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:10:30.939Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: LOAN-01, JRN-01 J13e (3 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Request loan 500, down payment 50, from S | `POST /requestLoan?customerId=16541&amount=500&downPayment=50&fromAccountId=22557` | 200 | {"responseDate":1795522229153,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":22890} | 22557: 203.01 → 153.01 | LoanResponse; loan and down payment recorded |
| 2 | state | Loan account | `GET /accounts/22890` | 200 | {"id":22890,"customerId":16541,"type":"LOAN","balance":500.00} | — | LOAN account |
| 3 | fail | Transactions of the loan account | `GET /accounts/22890/transactions` | 200 | [] | — | at least one entry recording the loan |
| 4 | control | Transactions of S with amount 50.00 | `GET /accounts/22557/transactions/amount/50` | 200 | [{"id":69088,"accountId":22557,"type":"Debit","date":1795478400000,"amount":50.00,"description":"Down Payment for Loan # 22890"}] | — | down payment Debit 50.00 |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
