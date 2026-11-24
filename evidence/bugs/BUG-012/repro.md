# BUG-012 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:09:19.753Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: TRF-07 (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: transfer 1.00 S → T | `POST /transfer?fromAccountId=22557&toAccountId=22668&amount=1` | 200 | Successfully transferred $1 from account #22557 to account #22668 | 22557: 102 → 101; 22668: 101 → 102 | 200 |
| 2 | fail | Transfer without amount | `POST /transfer?fromAccountId=22557&toAccountId=22668` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | 22557: 101 → 101; 22668: 102 → 102 | 400 with a message |
| 3 | fail | Transfer with amount "abc" | `POST /transfer?fromAccountId=22557&toAccountId=22668&amount=abc` | 404 |  | 22557: 101 → 101; 22668: 102 → 102 | 400 with a message |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
