# Stage 1 observations — qa_s1_mwuna0ui (customer 15098), A=19671, B=19893, F=19782

Run: 2026-11-24T12:02:17.533Z → 2026-11-24T12:06:38.387Z. Credentials and SSN redacted.

| ID | Purpose | Request | Status | ms | Balances before → after | Body (excerpt) |
|---|---|---|---|---|---|---|
| J02 | login with valid credentials | GET /login/qa_s1_mwuna0ui/<REDACTED> | 200 | 222 |  | {"id":15098,"firstName":"QA","lastName":"Throwaway","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phon |
| J03 | get customer | GET /customers/15098 | 200 | 228 |  | {"id":15098,"firstName":"QA","lastName":"Throwaway","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phon |
| J04 | list accounts | GET /customers/15098/accounts | 200 | 241 |  | [{"id":19671,"customerId":15098,"type":"CHECKING","balance":415.50},{"id":19782,"customerId":15098,"type":"CHECKING","balance":100.00}] |
| J05 | get account A | GET /accounts/19671 | 200 | 253 |  | {"id":19671,"customerId":15098,"type":"CHECKING","balance":415.50} |
| J06 | open SAVINGS account funded from A (newAccountType=1) | POST /createAccount?customerId=15098&newAccountType=1&fromAccountId=19671 | 200 | 235 | 19671: 415.5 → 315.5 | {"id":19893,"customerId":15098,"type":"SAVINGS","balance":0} |
| J06b | read new account B right after creation | GET /accounts/19893 | 200 | 228 |  | {"id":19893,"customerId":15098,"type":"SAVINGS","balance":100.00} |
| J07 | deposit 200 to B | POST /deposit?accountId=19893&amount=200 | 200 | 266 | 19893: 100 → 300 | Successfully deposited $200 to account #19893 |
| J08 | withdraw 20 from B | POST /withdraw?accountId=19893&amount=20 | 200 | 223 | 19893: 300 → 280 | Successfully withdrew $20 from account #19893 |
| J09 | transfer 50 B -> A | POST /transfer?fromAccountId=19893&toAccountId=19671&amount=50 | 200 | 249 | 19671: 315.5 → 365.5; 19893: 280 → 230 | Successfully transferred $50 from account #19893 to account #19671 |
| J10 | billpay 30 from A to payee whose accountNumber = F | POST /billpay?accountId=19671&amount=30 | 200 | 225 | 19671: 365.5 → 335.5; 19782: 100 → 100 | {"payeeName":"City Utilities","amount":30,"accountId":19671} |
| J11a | transactions on A | GET /accounts/19671/transactions | 200 | 252 |  | [{"id":57988,"accountId":19671,"type":"Debit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Sent"},{"id":58210,"account |
| J11b | transactions on B | GET /accounts/19893/transactions | 200 | 223 |  | [{"id":58321,"accountId":19893,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":58432,"ac |
| J11c | single transaction by id (last on A) | GET /transactions/58876 | 200 | 224 |  | {"id":58876,"accountId":19671,"type":"Debit","date":1795478400000,"amount":30.00,"description":"Bill Payment to City Utilities"} |
| J12a | filter A by amount 50 | GET /accounts/19671/transactions/amount/50 | 200 | 224 |  | [{"id":58765,"accountId":19671,"type":"Credit","date":1795478400000,"amount":50.00,"description":"Funds Transfer Received"}] |
| J12b | filter A onDate MM-dd-yyyy | GET /accounts/19671/transactions/onDate/11-24-2026 | 200 | 232 |  | [{"id":57988,"accountId":19671,"type":"Debit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Sent"},{"id":58210,"account |
| J12c | filter A onDate yyyy-MM-dd | GET /accounts/19671/transactions/onDate/2026-11-24 | 200 | 231 |  | [] |
| J12d | filter A fromDate/toDate MM-dd-yyyy | GET /accounts/19671/transactions/fromDate/11-24-2026/toDate/11-24-2026 | 200 | 227 |  | [{"id":57988,"accountId":19671,"type":"Debit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Sent"},{"id":58210,"account |
| J12e | filter A fromDate/toDate yyyy-MM-dd | GET /accounts/19671/transactions/fromDate/2026-11-24/toDate/2026-11-24 | 200 | 226 |  | [] |
| J12f | filter A month name / type Credit | GET /accounts/19671/transactions/month/November/type/Credit | 200 | 228 |  | [{"id":58765,"accountId":19671,"type":"Credit","date":1795478400000,"amount":50.00,"description":"Funds Transfer Received"}] |
| J12g | filter A month name / type CREDIT | GET /accounts/19671/transactions/month/November/type/CREDIT | 500 | 232 |  |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| J12h | filter A month number / type All | GET /accounts/19671/transactions/month/11/type/All | 200 | 228 |  | [{"id":57988,"accountId":19671,"type":"Debit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Sent"},{"id":58210,"account |
| J12i | filter A month All / type Debit | GET /accounts/19671/transactions/month/All/type/Debit | 200 | 226 |  | [{"id":57988,"accountId":19671,"type":"Debit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Sent"},{"id":58210,"account |
| J13 | request loan 500, down payment 50, from A | POST /requestLoan?customerId=15098&amount=500&downPayment=50&fromAccountId=19671 | 200 | 295 | 19671: 335.5 → 285.5 | {"responseDate":1795521803518,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":true,"accountId":20004} |
| J13b | accounts after loan | GET /customers/15098/accounts | 200 | 227 |  | [{"id":19671,"customerId":15098,"type":"CHECKING","balance":285.50},{"id":19782,"customerId":15098,"type":"CHECKING","balance":100.00},{"id" |
| J14 | buy 2 shares x 10.00 from A | POST /customers/15098/buyPosition?accountId=19671&name=QA+Test+Stock&symbol=QATS&shares=2&pricePerShare=10 | 200 | 232 | 19671: 285.5 → 265.5 | [{"positionId":13017,"customerId":15098,"name":"QA Test Stock","symbol":"QATS","shares":2,"purchasePrice":10.0000}] |
| J14b | list positions | GET /customers/15098/positions | 200 | 226 |  | [{"positionId":13017,"customerId":15098,"name":"QA Test Stock","symbol":"QATS","shares":2,"purchasePrice":10.0000}] |
| J14c | get position by id | GET /positions/13017 | 200 | 226 |  | {"positionId":13017,"customerId":15098,"name":"QA Test Stock","symbol":"QATS","shares":2,"purchasePrice":10.0000} |
| J15 | sell 1 share x 12.00 to A | POST /customers/15098/sellPosition?accountId=19671&positionId=13017&shares=1&pricePerShare=12 | 200 | 228 | 19671: 265.5 → 277.5 | [{"positionId":13017,"customerId":15098,"name":"QA Test Stock","symbol":"QATS","shares":1,"purchasePrice":10.0000}] |
| J15b | get position after sell | GET /positions/13017 | 200 | 230 |  | {"positionId":13017,"customerId":15098,"name":"QA Test Stock","symbol":"QATS","shares":1,"purchasePrice":10.0000} |
| J16 | update profile: new street + phone | POST /customers/update/15098?username=qa_s1_mwuna0ui&password=<REDACTED>&ssn=<REDACTED>&firstName=QA&lastName=Throwaway&street=99+New+Street&city | 200 | 223 |  | Successfully updated customer profile |
| J16b | customer after update | GET /customers/15098 | 200 | 227 |  | {"id":15098,"firstName":"QA","lastName":"Throwaway","address":{"street":"99 New Street","city":"Testville","state":"TS","zipCode":"00000"}," |
| J16c | login after update | GET /login/qa_s1_mwuna0ui/<REDACTED> | 200 | 223 |  | {"id":15098,"firstName":"QA","lastName":"Throwaway","address":{"street":"99 New Street","city":"Testville","state":"TS","zipCode":"00000"}," |
| J16d | restore original profile | POST /customers/update/15098?username=qa_s1_mwuna0ui&password=<REDACTED>&ssn=<REDACTED>&firstName=QA&lastName=Throwaway&street=1+Test+St&city=Tes | 200 | 224 |  | Successfully updated customer profile |
| J17 | final accounts list | GET /customers/15098/accounts | 200 | 221 |  | [{"id":19671,"customerId":15098,"type":"CHECKING","balance":277.50},{"id":19782,"customerId":15098,"type":"CHECKING","balance":100.00},{"id" |
| E-AUTH1 | wrong password | GET /login/qa_s1_mwuna0ui/wrong_1795521831243 | 400 | 224 |  | Invalid username and/or password |
| E-AUTH2 | unknown user | GET /login/nouser_1795521832970/whatever | 400 | 225 |  | Invalid username and/or password |
| E-AUTH3 | injection-style username | GET /login/'%20OR%20'1'%3D'1/x | 403 | 80 |  | <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><m |
| E-AUTH4 | login with XML Accept | GET /login/qa_s1_mwuna0ui/<REDACTED> | 200 | 709 |  | <?xml version="1.0" encoding="UTF-8" standalone="yes"?><customer><id>15098</id><firstName>QA</firstName><lastName>Throwaway</lastName><addre |
| E-AUTH5 | read own customer with no session/credentials | GET /customers/15098 | 200 | 253 |  | {"id":15098,"firstName":"QA","lastName":"Throwaway","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phon |
| E-ID1 | customer -1 | GET /customers/-1 | 400 | 248 |  | Could not find customer #-1 |
| E-ID2 | account -1 | GET /accounts/-1 | 400 | 635 |  | Could not find account #-1 |
| E-ID3 | account 0 | GET /accounts/0 | 400 | 239 |  | Could not find account #0 |
| E-ID4 | account non-numeric | GET /accounts/abc | 404 | 224 |  |  |
| E-ID5 | transaction -1 | GET /transactions/-1 | 400 | 241 |  | Could not find transaction #-1 |
| E-ID6 | transactions of account -1 | GET /accounts/-1/transactions | 400 | 248 |  | Could not find transactions for account #-1 |
| E-TRF1 | transfer 0 | POST /transfer?fromAccountId=19782&toAccountId=19671&amount=0 | 200 | 250 | 19671: 277.5 → 277.5; 19782: 100 → 100 | Successfully transferred $0 from account #19782 to account #19671 |
| E-TRF2 | transfer -1 | POST /transfer?fromAccountId=19782&toAccountId=19671&amount=-1 | 200 | 231 | 19671: 277.5 → 276.5; 19782: 100 → 101 | Successfully transferred $-1 from account #19782 to account #19671 |
| E-TRF3 | transfer > balance (100000) | POST /transfer?fromAccountId=19782&toAccountId=19671&amount=100000 | 200 | 223 | 19671: 276.5 → 100276.5; 19782: 101 → -99899 | Successfully transferred $100000 from account #19782 to account #19671 |
| E-TRF4 | transfer to same account | POST /transfer?fromAccountId=19782&toAccountId=19782&amount=1 | 200 | 224 | 19782: -99899 → -99899 | Successfully transferred $1 from account #19782 to account #19782 |
| E-TRF5 | transfer to non-existent account -1 | POST /transfer?fromAccountId=19782&toAccountId=-1&amount=1 | 400 | 222 | 19782: -99899 → -99899 | Could not find account number 19782 and/or -1 |
| E-TRF6 | transfer missing amount | POST /transfer?fromAccountId=19782&toAccountId=19671 | 500 | 232 | 19671: 100276.5 → 100276.5; 19782: -99899 → -99899 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-TRF8 | transfer non-numeric amount | POST /transfer?fromAccountId=19782&toAccountId=19671&amount=abc | 404 | 224 | 19671: 100276.5 → 100276.5; 19782: -99899 → -99899 |  |
| E-DEP1 | deposit 0 | POST /deposit?accountId=19782&amount=0 | 200 | 231 | 19782: -99899 → -99899 | Successfully deposited $0 to account #19782 |
| E-DEP2 | deposit -5 | POST /deposit?accountId=19782&amount=-5 | 200 | 223 | 19782: -99899 → -99904 | Successfully deposited $-5 to account #19782 |
| E-DEP3 | deposit to account -1 | POST /deposit?accountId=-1&amount=1 | 400 | 221 |  | Could not find account number -1 |
| E-WDR1 | withdraw > balance (100000) | POST /withdraw?accountId=19782&amount=100000 | 200 | 224 | 19782: -99904 → -199904 | Successfully withdrew $100000 from account #19782 |
| E-WDR2 | withdraw -5 | POST /withdraw?accountId=19782&amount=-5 | 200 | 225 | 19782: -199904 → -199899 | Successfully withdrew $-5 from account #19782 |
| E-WDR3 | withdraw 0 | POST /withdraw?accountId=19782&amount=0 | 200 | 227 | 19782: -199899 → -199899 | Successfully withdrew $0 from account #19782 |
| E-BIL1 | billpay > balance (100000) | POST /billpay?accountId=19782&amount=100000 | 200 | 228 | 19671: 100276.5 → 100276.5; 19782: -199899 → -299899 | {"payeeName":"City Utilities","amount":100000,"accountId":19782} |
| E-BIL2 | billpay with empty payee {} | POST /billpay?accountId=19782&amount=1 | 200 | 224 | 19782: -299899 → -299900 | {"payeeName":null,"amount":1,"accountId":19782} |
| E-BIL3 | billpay -5 | POST /billpay?accountId=19782&amount=-5 | 200 | 230 | 19671: 100276.5 → 100276.5; 19782: -299900 → -299895 | {"payeeName":"City Utilities","amount":-5,"accountId":19782} |
| E-LON1 | loan amount -100 | POST /requestLoan?customerId=15098&amount=-100&downPayment=10&fromAccountId=19782 | 200 | 273 | 19782: -299895 → -299895 | {"responseDate":1795521958374,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":false,"message":"error.insufficient.fun |
| E-LON2 | loan down payment > balance | POST /requestLoan?customerId=15098&amount=1000&downPayment=100000&fromAccountId=19782 | 200 | 260 | 19782: -299895 → -299895 | {"responseDate":1795521963591,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":false,"message":"error.insufficient.fun |
| E-LON3 | loan down payment > loan amount | POST /requestLoan?customerId=15098&amount=10&downPayment=20&fromAccountId=19782 | 200 | 238 | 19782: -299895 → -299895 | {"responseDate":1795521968790,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":false,"message":"error.insufficient.fun |
| E-LON4 | loan amount 0 | POST /requestLoan?customerId=15098&amount=0&downPayment=0&fromAccountId=19782 | 200 | 339 | 19782: -299895 → -299895 | {"responseDate":1795521974014,"loanProviderName":"Wealth Securities Dynamic Loans (WSDL)","approved":false,"message":"error.insufficient.fun |
| E-OPN1 | create account from non-existent source -1 | POST /createAccount?customerId=15098&newAccountType=0&fromAccountId=-1 | 400 | 236 |  | Could not create new account for customer 15098 from account -1 |
| E-INV1 | sell more shares than owned (100) | POST /customers/15098/sellPosition?accountId=19671&positionId=13017&shares=100&pricePerShare=10 | 200 | 224 | 19671: 100276.5 → 101276.5 | [{"positionId":13017,"customerId":15098,"name":"QA Test Stock","symbol":"QATS","shares":-99,"purchasePrice":10.0000}] |
| E-TRX1 | filter invalid date format | GET /accounts/19671/transactions/onDate/not-a-date | 400 | 220 |  | Unable to parse date not-a-date |
| E-TRX2 | filter by amount non-numeric | GET /accounts/19671/transactions/amount/abc | 404 | 225 |  |  |
| E-PRF1 | update profile missing lastName | POST /customers/update/15098?username=qa_s1_mwuna0ui&password=<REDACTED>&ssn=<REDACTED>&firstName=QA&street=1+Test+St&city=Testville&state=TS&zip | 500 | 228 |  |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns= |
| E-PRF2 | customer after failed update | GET /customers/15098 | 200 | 225 |  | {"id":15098,"firstName":"QA","lastName":"Throwaway","address":{"street":"1 Test St","city":"Testville","state":"TS","zipCode":"00000"},"phon |
| E-TRF7 | transfer 3-decimal amount 0.005 (last: breaks the accounts) | POST /transfer?fromAccountId=19782&toAccountId=19671&amount=0.005 | 200 | 270 | 19671: 101276.5 → HTTP 500; 19782: -299895 → HTTP 500 | Successfully transferred $0.005 from account #19782 to account #19671 |
