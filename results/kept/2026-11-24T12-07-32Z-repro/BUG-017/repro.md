# BUG-017 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:10:48.285Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: —.

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: buy 2 shares × 10.00 from A | `POST /customers/16541/buyPosition?accountId=22446&name=QA+Test+Stock&symbol=QATS&shares=2&pricePerShare=10` | 200 | [{"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":2,"purchasePrice":10.0000}] | 22446: 215.5 → 195.5 | A − 20.00, position with 2 shares |
| 2 | control | Control: sell 1 share × 12.00 to A | `POST /customers/16541/sellPosition?accountId=22446&positionId=13128&shares=1&pricePerShare=12` | 200 | [{"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":1,"purchasePrice":10.0000}] | 22446: 195.5 → 207.5 | A + 12.00, position with 1 share |
| 3 | fail | Sell 100 shares × 10.00 (the position holds 1) | `POST /customers/16541/sellPosition?accountId=22446&positionId=13128&shares=100&pricePerShare=10` | 200 | [{"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":-99,"purchasePrice":10.0000}] | 22446: 207.5 → 1207.5 | 4xx, nothing changes (cannot sell shares not owned) |
| 4 | state | Position after the oversell | `GET /positions/13128` | 200 | {"positionId":13128,"customerId":16541,"name":"QA Test Stock","symbol":"QATS","shares":-99,"purchasePrice":10.0000} | — | still 1 share |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
