# BUG-008 — reproduction on fresh data

Throwaway user qa_s4_mwungyju (customer 16541), run 2026-11-24T12:07:54.900Z. Requests paced 1.5 s; balances read with `GET /accounts/{id}` before and after each call.
Related Stage 3 cases: AUTH-03.

| # | Kind | Step | Request | Status | Response | Balances before → after | Expected |
|---|---|---|---|---|---|---|---|
| 1 | fail | Login with a wrong password: the server parses the password from the URL path | `GET /login/qa_s4_mwungyju/NotMyRealPassword-123` | 400 | Invalid username and/or password | — | credentials not in the URL (POST body or header) |

*Kind:* control = valid input that should work · fail = the input under test · state = read-back.
