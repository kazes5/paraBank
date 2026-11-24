# BUG-001 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:52:12.195Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-09 (manual test: see the screenshots in results/kept/2026-11-23T16-35-57Z-manual/screenshots/).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: transfer 0.01 X → Y | `POST /transfer?fromAccountId=103476&toAccountId=103587&amount=0.01` | 200 | Successfully transferred $0.01 from account #103476 to account #103587 | 103476: 100 → 99.99; 103587: 100 → 100.01 | X −0.01, Y +0.01 |
| 2 | fail | Transfer 0.005 X → Y | `POST /transfer?fromAccountId=103476&toAccountId=103587&amount=0.005` | 200 | Successfully transferred $0.005 from account #103476 to account #103587 | 103476: 99.99 → HTTP 500; 103587: 100.01 → HTTP 500 | 4xx (or rounded), accounts stay readable |
| 3 | fail | Customer account list after the 0.005 transfer | `GET /customers/60497/accounts` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | — | 200 |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
