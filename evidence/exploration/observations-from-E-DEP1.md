# Stage 1 observations — <USERNAME> (customer 17762), A=23112, B=undefined, F=23223

Run: 2026-11-23T13:05:53.230Z → 2026-11-23T13:07:08.353Z. Credentials and SSN redacted.

| ID | Purpose | Request | Status | ms | Balances before → after | Body (excerpt) |
|---|---|---|---|---|---|---|
| E-DEP1 | deposit 0 | POST /deposit?accountId=23223&amount=0 | 200 | 228 | 23223: 100 → 100 | Successfully deposited $0 to account #23223 |
| E-DEP2 | deposit -5 | POST /deposit?accountId=23223&amount=-5 | 200 | 237 | 23223: 100 → 95 | Successfully deposited $-5 to account #23223 |
| E-DEP3 | deposit to account -1 | POST /deposit?accountId=-1&amount=1 | 400 | 272 |  | Could not find account number -1 |
| E-WDR1 | withdraw > balance (100000) | POST /withdraw?accountId=23223&amount=100000 | 200 | 247 | 23223: 95 → -99905 | Successfully withdrew $100000 from account #23223 |
| E-WDR2 | withdraw -5 | POST /withdraw?accountId=23223&amount=-5 | 200 | 220 | 23223: -99905 → -99900 | Successfully withdrew $-5 from account #23223 |
| E-WDR3 | withdraw 0 | POST /withdraw?accountId=23223&amount=0 | 200 | 265 | 23223: -99900 → -99900 | Successfully withdrew $0 from account #23223 |
| E-BIL1 | billpay > balance (100000) | POST /billpay?accountId=23223&amount=100000 | 200 | 221 | 23112: 215.5 → 215.5; 23223: -99900 → -199900 | {"payeeName":"City Utilities","amount":100000,"accountId":23223} |
| E-BIL2 | billpay with empty payee {} | POST /billpay?accountId=23223&amount=1 | 200 | 244 | 23223: -199900 → -199901 | {"payeeName":null,"amount":1,"accountId":23223} |
| E-BIL3 | billpay -5 | POST /billpay?accountId=23223&amount=-5 | 200 | 284 | 23112: 215.5 → 215.5; 23223: -199901 → -199896 | {"payeeName":"City Utilities","amount":-5,"accountId":23223} |
| E-LON1 | loan amount -100 | POST /requestLoan?customerId=17762&amount=-100&downPayment=10&fromAccountId=23223 | 500 | 223 | 23223: -199896 → -199896 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-LON2 | loan down payment > balance | POST /requestLoan?customerId=17762&amount=1000&downPayment=100000&fromAccountId=23223 | 500 | 218 | 23223: -199896 → -199896 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-LON3 | loan down payment > loan amount | POST /requestLoan?customerId=17762&amount=10&downPayment=20&fromAccountId=23223 | 500 | 223 | 23223: -199896 → -199896 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-LON4 | loan amount 0 | POST /requestLoan?customerId=17762&amount=0&downPayment=0&fromAccountId=23223 | 500 | 234 | 23223: -199896 → -199896 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-OPN1 | create account from non-existent source -1 | POST /createAccount?customerId=17762&newAccountType=0&fromAccountId=-1 | 400 | 279 |  | Could not create new account for customer 17762 from account -1 |
| E-TRX1 | filter invalid date format | GET /accounts/23112/transactions/onDate/not-a-date | 400 | 219 |  | Unable to parse date not-a-date |
| E-TRX2 | filter by amount non-numeric | GET /accounts/23112/transactions/amount/abc | 404 | 238 |  |  |
| E-PRF1 | update profile missing lastName | POST /customers/update/17762?username=<USERNAME>&password=<REDACTED>&ssn=<REDACTED>&firstName=<FIRST_NAME>&street=<STREET>&city=<CITY>&state=some+stat | 500 | 279 |  |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-PRF2 | customer after failed update | GET /customers/17762 | 200 | 218 |  | {"id":17762,"firstName":"<FIRST_NAME>","lastName":"<LAST_NAME>","address":{"street":"<STREET>","city":"<CITY>","state":"<STATE>","zipCode":"zipzi |
