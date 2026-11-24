# S-LOAN — reproduction on fresh data

Throwaway user qa_s4_mwunlevw (customer 16652), run 2026-11-24T12:11:15.379Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: —.

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Customer total positive (A + S, each with its opening balance): loan 100, down 50 from S | `POST /requestLoan?customerId=16652&amount=100&downPayment=50&fromAccountId=24777` | 200 | {"responseDate":1795522271850,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":24888} | 23112: 415.5 → 415.5; 24777: 100 → 50 | approved |
| 2 | state | Overdraw A by withdrawing 1000.00 (customer total becomes negative; S untouched) | `POST /withdraw?accountId=23112&amount=1000` | 200 | Successfully withdrew $1000 from account #23112 | 23112: 415.5 → -584.5; 24777: 50 → 50 |  |
| 3 | fail | Same loan again from S (S still holds 50.00 ≥ down payment 10) | `POST /requestLoan?customerId=16652&amount=100&downPayment=10&fromAccountId=24777` | 200 | {"responseDate":1795522289177,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":false,"message":"error.insufficient.funds.for.down.payment","accountId":null} | 23112: -584.5 → -584.5; 24777: 50 → 50 | decision based on S, or a message naming the real reason |
| 4 | state | Deposit 2000.00 into A (customer total positive again) | `POST /deposit?accountId=23112&amount=2000` | 200 | Successfully deposited $2000 to account #23112 | 23112: -584.5 → 1415.5; 24777: 50 → 50 |  |
| 5 | control | Same loan again from S | `POST /requestLoan?customerId=16652&amount=100&downPayment=10&fromAccountId=24777` | 200 | {"responseDate":1795522306505,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":24999} | 23112: 1415.5 → 1415.5; 24777: 50 → 40 | approved |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
