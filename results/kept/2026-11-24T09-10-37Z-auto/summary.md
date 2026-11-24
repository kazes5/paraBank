# Coded tests (pytest) — run 2026-11-24T09-10-37Z-auto

pytest + requests against `https://parabank.parasoft.com/parabank/services/bank` as `<USERNAME>`. Known defects are marked `xfail(strict=True)`: the run stays green while they still reproduce, and fails when one is fixed.

| Case | Test | Result | Meaning | Known defect | Time (s) | Log |
|---|---|---|---|---|---|---|
| ACCT-03 | `test_unknown_account_returns_error[-1]` | **PASSED** | PASS | — | 2.2 | — |
| ACCT-03 | `test_unknown_account_returns_error[0]` | **PASSED** | PASS | — | 1.8 | — |
| JRN-01 | `test_customer_journey` | **XFAIL** | FAIL — known defect still reproduces | — | 78.8 | [log](logs/test_customer_journey.log) |
| TRF-01 | `test_transfer_conserves_total` | **PASSED** | PASS | — | 15.7 | — |
| TRF-03 | `test_negative_transfer_rejected` | **XFAIL** | FAIL — known defect still reproduces | BUG-003 | 8.7 | [log](logs/test_negative_transfer_rejected.log) |
| DEP-01 | `test_deposit_increases_balance` | **PASSED** | PASS | — | 8.7 | — |

JUnit report: `junit.xml`. Re-run: `./run.sh auto`.
