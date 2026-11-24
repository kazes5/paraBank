# BUG-013 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:09:38.836Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: HIST-04 (1 FAILED records in `stage3-failures.json`).

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | control | Control: month filter with type Credit | `GET /accounts/22557/transactions/month/November/type/Credit` | 200 | [{"id":64981,"accountId":22557,"type":"Credit","date":1795478400000,"amount":100.00,"description":"Funds Transfer Received"},{"id":65980,"accountId":22557,"type":"Credit","date":1795478400000,"amount":-5.00,"description" | — | 200, list |
| 2 | fail | Month filter with type CREDIT | `GET /accounts/22557/transactions/month/November/type/CREDIT` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | — | 400 with a message |
| 3 | fail | Month filter with type foo | `GET /accounts/22557/transactions/month/November/type/foo` | 500 |  <!-- <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"> <html xmlns="http://www.w3.org/1999/xhtml"> --> <!DOCTYPE html> <html> <head> <meta charset= | — | 400 with a message |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
