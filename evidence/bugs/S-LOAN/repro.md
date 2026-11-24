# S-LOAN — reproduction on fresh data

Throwaway user qa_s4_mwti5prg (customer 62495), run 2026-11-23T16:51:18.885Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: —.

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Customer total positive (A 415.50 + S 100.00): loan 100, down 50 from S | `POST /requestLoan?customerId=62495&amount=100&downPayment=50&fromAccountId=103143` | 200 | {"responseDate":1795452675361,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":103254} | 103032: 415.5 → 415.5; 103143: 100 → 50 | approved |
| 2 | state | Overdraw A by withdrawing 1000.00 (customer total becomes negative; S untouched) | `POST /withdraw?accountId=103032&amount=1000` | 200 | Successfully withdrew $1000 from account #103032 | 103032: 415.5 → -584.5; 103143: 50 → 50 |  |
| 3 | fail | Same loan again from S (S still holds 50.00 ≥ down payment 10) | `POST /requestLoan?customerId=62495&amount=100&downPayment=10&fromAccountId=103143` | 200 | {"responseDate":1795452692997,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":false,"message":"error.insufficient.funds.for.down.payment","accountId":null} | 103032: -584.5 → -584.5; 103143: 50 → 50 | decision based on S, or a message naming the real reason |
| 4 | state | Deposit 2000.00 into A (customer total positive again) | `POST /deposit?accountId=103032&amount=2000` | 200 | Successfully deposited $2000 to account #103032 | 103032: -584.5 → 1415.5; 103143: 50 → 50 |  |
| 5 | control | Same loan again from S | `POST /requestLoan?customerId=62495&amount=100&downPayment=10&fromAccountId=103143` | 200 | {"responseDate":1795452713455,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":103365} | 103032: 1415.5 → 1415.5; 103143: 50 → 40 | approved |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
