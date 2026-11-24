"""ACCT-03: an account that doesn't exist returns an error and no data (rule A8)."""

import pytest


# Two IDs that can never be real accounts: a negative number and zero.
@pytest.mark.parametrize("account_id", ["-1", "0"])
def test_unknown_account_returns_error(api, account_id):
    resp = api.get("/accounts/" + account_id)

    assert 400 <= resp.status_code < 500, "expected a 4xx error, got %s" % resp.status_code
    assert '"balance"' not in resp.text, "error response must not contain account data"


# STD case ID for summary.md (set after the function, since parametrize wraps it).
test_unknown_account_returns_error.case = "ACCT-03"
