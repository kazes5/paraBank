# BUG-001 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:12:02.090Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-09.

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: transfer 0.01 X → Y | `POST /transfer?fromAccountId=25110&toAccountId=25221&amount=0.01` | 200 | Successfully transferred $0.01 from account #25110 to account #25221 | 25110: 100 → 99.99; 25221: 100 → 100.01 | X −0.01, Y +0.01 |
| 2 | fail | Transfer 0.005 X → Y | `POST /transfer?fromAccountId=25110&toAccountId=25221&amount=0.005` | 200 | Successfully transferred $0.005 from account #25110 to account #25221 | 25110: 99.99 → HTTP 500; 25221: 100.01 → HTTP 500 | 4xx (or rounded), accounts stay readable |
| 3 | fail | Customer account list after the 0.005 transfer | `GET /customers/16541/accounts` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | — | 200 |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
