# BUG-013 — reproduction on fresh data

Throwaway user qa_s4_mwti1l42 (customer 60497), run 2026-11-23T16:49:58.855Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: HIST-04 (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: month filter with type Credit | `GET /accounts/99258/transactions/month/November/type/Credit` | 200 | [{"id":152560,"accountId":99258,"type":"Credit","date":1795392000000,"amount":100.00,"description":"Funds Transfer Received"},{"id":153559,"accountId":99258,"type":"Credit","date":1795392000000,"amount":-5.00,"descriptio | — | 200, list |
| 2 | fail | Month filter with type CREDIT | `GET /accounts/99258/transactions/month/November/type/CREDIT` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | — | 400 with a message |
| 3 | fail | Month filter with type foo | `GET /accounts/99258/transactions/month/November/type/foo` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | — | 400 with a message |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
