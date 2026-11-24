"""Shared pytest setup for the coded tests (plan.md Stage 7).

- Credentials and profile come from environment variables (loaded from the repo's .env when present).
- ApiClient paces requests 1.5 s apart (the public site rate-limits), stops on HTTP 429,
  refuses the admin endpoints, and records every exchange of the running test.
- On a failure (or a known-defect xfail) the test's request/response log is written to
  results/runs/<UTC>-auto/logs/<test>.log, credentials redacted in every encoding.
- At the end, run.json, summary.md and junit.xml go to the same run folder (see README.md).
"""

import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, quote_plus

import pytest
import requests

# Repo root (tests/automation/ → two levels up), request pacing and timeout,
# and the admin endpoints that affect every user of the shared site (never called).
ROOT = Path(__file__).resolve().parents[2]
PACE_S = 1.5
TIMEOUT_S = 5
FORBIDDEN = re.compile(r"cleanDB|initializeDB|setParameter|JmsListener", re.I)


# ---------------------------------------------------------------- environment


# Minimal .env reader (no extra dependency): KEY=value lines, quotes stripped.
# setdefault keeps values already set in the real environment (they take precedence).
def _load_dotenv(path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(ROOT / ".env")
# Which .env user to run as (./run.sh auto --user PARABANK2 sets AUTO_USER), and the target API.
PREFIX = os.environ.get("AUTO_USER", "PARABANK")
BASE = os.environ.get("BASE_URL", "https://parabank.parasoft.com/parabank").rstrip("/")
API = BASE + "/services/bank"


# One value of the selected user, e.g. env("USERNAME") reads PARABANK_USERNAME.
def env(key):
    return os.environ.get(PREFIX + "_" + key, "")


# The test user's credentials and registration profile (the journey compares the profile with these).
USER = {
    "username": env("USERNAME"),
    "password": env("PASSWORD"),
    "ssn": env("SSN"),
    "firstName": env("FIRST_NAME"),
    "lastName": env("LAST_NAME"),
    "street": env("STREET"),
    "city": env("CITY"),
    "state": env("STATE"),
    "zipCode": env("ZIP"),
    "phoneNumber": env("PHONE"),
}

# Values that must never reach a log file or report.
SECRETS = [s for s in (USER["password"], USER["ssn"]) if s]


# The test users' profile is personal data and the repo is public: each value (in every encoding)
# becomes a placeholder such as <FIRST_NAME>. Whole words only, so short values never mangle other words.
_PROFILE_FORMS = {}
for _p in ("PARABANK", "PARABANK2"):
    for _k in ("USERNAME", "FIRST_NAME", "LAST_NAME", "STREET", "CITY", "STATE", "ZIP", "PHONE"):
        _v = os.environ.get(_p + "_" + _k, "")
        if _v:
            for _form in {_v, quote(_v, safe=""), quote_plus(_v), json.dumps(_v)[1:-1]}:
                _PROFILE_FORMS[_form] = "<%s>" % _k
_PROFILE_RE = (
    re.compile(
        r"(?<![A-Za-z0-9])(%s)(?![A-Za-z0-9])"
        % "|".join(re.escape(f) for f in sorted(_PROFILE_FORMS, key=len, reverse=True))
    )
    if _PROFILE_FORMS
    else None
)


# Replaces each secret in every form it can take (raw, URL path-encoded, query-encoded, JSON-escaped)
# with <REDACTED>, then each profile value with its placeholder.
def redact(text):
    text = str(text)
    for secret in SECRETS:
        for form in {secret, quote(secret, safe=""), quote_plus(secret), json.dumps(secret)[1:-1]}:
            text = text.replace(form, "<REDACTED>")
    return _PROFILE_RE.sub(lambda m: _PROFILE_FORMS[m.group(0)], text) if _PROFILE_RE else text


# ---------------------------------------------------------------- run folder

# This session's run folder: results/runs/<UTC time>-auto/ (same layout as the other run kinds).
# OUTCOMES collects one entry per test for summary.md and results.json.
STAMP = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
RUN_ID = STAMP + "-auto"
RUN_DIR = ROOT / "results" / "runs" / RUN_ID
LOG_DIR = RUN_DIR / "logs"
OUTCOMES = []


# Short git commit of the code under test (empty outside a git checkout).
def _commit():
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL)
            .decode()
            .strip()
        )
    except Exception:
        return ""


# pytest hook, runs once at start: create the run folder, mark it as the last run (for --keep),
# send the JUnit report into it, and write run.json.
def pytest_configure(config):
    if config.option.collectonly:  # listing tests is not a run: no run folder
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    (ROOT / "results" / ".last-run").write_text(RUN_ID + "\n")
    if not config.option.xmlpath:
        config.option.xmlpath = str(RUN_DIR / "junit.xml")
    _write_run_json(
        {
            "id": RUN_ID,
            "kind": "auto",
            "started": datetime.now(timezone.utc).isoformat(),
            "commit": _commit(),
            "user": redact(USER["username"]),
            "scope": "pytest: JRN-01, TRF-01, TRF-03, DEP-01, ACCT-03",
        }
    )


# Merges fields into run.json (created on first call).
def _write_run_json(fields):
    path = RUN_DIR / "run.json"
    current = json.loads(path.read_text()) if path.exists() else {}
    current.update(fields)
    path.write_text(json.dumps(current, indent=2) + "\n")


# ---------------------------------------------------------------- HTTP client


# Paced HTTP client shared by all tests. Every call is recorded (redacted) in `exchanges`,
# which is reset per test and written to the test's log file when it fails.
class ApiClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["Accept"] = "application/json"
        self.exchanges = []
        self._last = 0.0

    # One API call: refuse admin endpoints, wait until PACE_S has passed since the previous call,
    # send it, record it, and stop the whole session on HTTP 429 (exit code 3 = blocked).
    def call(self, method, path, params=None, body=None):
        if FORBIDDEN.search(path):
            raise RuntimeError("Forbidden endpoint: " + path)
        wait = PACE_S - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        started = time.monotonic()
        resp = self.session.request(method, API + path, params=params, json=body, timeout=TIMEOUT_S)
        self._last = time.monotonic()
        self.exchanges.append(
            {
                "at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                "method": method,
                "url": redact(resp.url),
                "body": redact(json.dumps(body)) if body is not None else None,
                "status": resp.status_code,
                "ms": round((time.monotonic() - started) * 1000),
                "response": redact(resp.text[:2000]),
            }
        )
        if resp.status_code == 429:
            pytest.exit("HTTP 429 from the site's rate limiter: stop and retry later", returncode=3)
        return resp

    def get(self, path, **kw):
        return self.call("GET", path, **kw)

    def post(self, path, **kw):
        return self.call("POST", path, **kw)

    # helpers used by several tests
    def balance_cents(self, account_id):
        resp = self.get("/accounts/%s" % account_id)
        assert resp.status_code == 200, "GET /accounts/%s -> %s" % (account_id, resp.status_code)
        return cents(resp.json()["balance"])

    def transactions(self, account_id):
        resp = self.get("/accounts/%s/transactions" % account_id)
        assert resp.status_code == 200, "GET /accounts/%s/transactions -> %s" % (account_id, resp.status_code)
        return resp.json()


# Money amount → integer cents, so balances are compared exactly (no float rounding errors).
def cents(value):
    return int(round(float(value) * 100))


@pytest.fixture(scope="session")
# Fixture: one client for the whole session; stops at once if the .env user is incomplete.
def api():
    missing = [k for k, v in USER.items() if not v]
    if missing:
        pytest.exit("Missing %s_* values in .env: %s" % (PREFIX, ", ".join(missing)), returncode=2)
    return ApiClient()


@pytest.fixture(autouse=True)
# Fixture used by every test: start each test with an empty request log, and attach the client
# to the test item so the report hook can find that log.
def _fresh_log(api, request):
    api.exchanges = []
    request.node.api = api
    yield


@pytest.fixture(scope="session")
# Fixture: log in once per session. Returns the customer ID, the login profile and account A
# (the lowest account ID = the account created at registration). A failed login means the site was reset.
def customer(api):
    resp = api.get("/login/%s/%s" % (quote(USER["username"], safe=""), quote(USER["password"], safe="")))
    if resp.status_code != 200:
        pytest.exit("Login failed (HTTP %s): after a site reset run ./run.sh setup" % resp.status_code, returncode=3)
    data = resp.json()
    accounts = api.get("/customers/%s/accounts" % data["id"]).json()
    return {"id": data["id"], "login": data, "A": sorted(a["id"] for a in accounts)[0]}


@pytest.fixture
def fresh_accounts(api, customer):
    """Two new CHECKING accounts S and T opened from A (each starts with the site's opening amount, moved in from A)."""
    ids = []
    for _ in range(2):
        resp = api.post(
            "/createAccount", params={"customerId": customer["id"], "newAccountType": 0, "fromAccountId": customer["A"]}
        )
        assert resp.status_code == 200, "fixture: createAccount -> %s" % resp.status_code
        ids.append(resp.json()["id"])
    api.exchanges = []  # the log of a failing test starts after its fixtures
    return {"S": ids[0], "T": ids[1]}


# ---------------------------------------------------------------- logs and summary


@pytest.hookimpl(hookwrapper=True)
# pytest hook, runs after each test phase. Records the outcome of the test call (or of a failed setup),
# and on a failure or known-defect xfail writes logs/<test>.log: the assertion, then every request and response.
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" and not (report.when == "setup" and report.failed):
        return
    xfail = hasattr(report, "wasxfail")
    verdict = "XFAIL" if xfail and report.skipped else "XPASS" if xfail else report.outcome.upper()
    # Known defect: from the @known_defect marker, or the BUG IDs named in a pytest.xfail() reason (the journey).
    known = item.get_closest_marker("known_defect")
    OUTCOMES.append(
        {
            "test": item.name,
            "case": getattr(item.function, "case", ""),
            "verdict": verdict,
            "seconds": round(report.duration, 1),
            "known": (
                known.args[0]
                if known
                else ", ".join(sorted(set(re.findall(r"BUG-\d+", getattr(report, "wasxfail", "")))))
            ),
            "message": redact(str(report.longrepr).splitlines()[-1]) if report.longrepr else "",
        }
    )
    if report.failed or xfail:
        api = getattr(item, "api", None)
        lines = [
            "%s — %s (%s)" % (item.nodeid, verdict, getattr(report, "wasxfail", "")),
            "",
            redact(str(report.longrepr or "")),
            "",
            "Requests:",
        ]
        for e in api.exchanges if api else []:
            lines += ["", "%s  %s %s  -> %s (%s ms)" % (e["at"], e["method"], e["url"], e["status"], e["ms"])]
            if e["body"]:
                lines.append("  body: " + e["body"])
            lines.append("  response: " + e["response"].replace("\n", " ")[:1000])
        (LOG_DIR / (item.name + ".log")).write_text(redact("\n".join(lines) + "\n"))


# pytest hook, runs once at the end: write summary.md (one row per test), results.json and the run.json counts.
def pytest_sessionfinish(session, exitstatus):
    if not OUTCOMES:
        return
    counts = {}
    for o in OUTCOMES:
        counts[o["verdict"]] = counts.get(o["verdict"], 0) + 1
    meaning = {
        "PASSED": "PASS",
        "FAILED": "FAIL (new failure)",
        "XFAIL": "FAIL — known defect still reproduces",
        "XPASS": "Known defect no longer reproduces: retest and close it",
        "SKIPPED": "skipped",
    }
    md = [
        "# Coded tests (pytest) — run " + RUN_ID,
        "",
        "pytest + requests against `%s` as `%s`. Known defects are marked `xfail(strict=True)`: the run stays green while they still reproduce, and fails when one is fixed."
        % (API, redact(USER["username"])),
        "",
        "| Case | Test | Result | Meaning | Known defect | Time (s) | Log |",
        "|---|---|---|---|---|---|---|",
    ]
    for o in OUTCOMES:
        log = "[log](logs/%s.log)" % o["test"] if (LOG_DIR / (o["test"] + ".log")).exists() else "—"
        md.append(
            "| %s | `%s` | **%s** | %s | %s | %s | %s |"
            % (o["case"], o["test"], o["verdict"], meaning.get(o["verdict"], ""), o["known"] or "—", o["seconds"], log)
        )
    md += ["", "JUnit report: `junit.xml`. Re-run: `./run.sh auto`.", ""]
    # Every file written to the run folder goes through redact() (secrets, then the profile placeholders).
    (RUN_DIR / "summary.md").write_text(redact("\n".join(md)))
    (RUN_DIR / "results.json").write_text(redact(json.dumps({"outcomes": OUTCOMES}, indent=2) + "\n"))
    _write_run_json({"finished": datetime.now(timezone.utc).isoformat(), "counts": counts})


# pytest hook, runs after the JUnit report is written: redact it too (placeholders XML-escaped).
def pytest_unconfigure(config):
    xml = getattr(config.option, "xmlpath", None)
    if xml and Path(xml).exists():
        text = redact(Path(xml).read_text())
        text = re.sub(
            r"<(REDACTED|[A-Z_]+)>",
            lambda m: (
                "&lt;%s&gt;" % m.group(1)
                if m.group(1) == "REDACTED" or "<%s>" % m.group(1) in _PROFILE_FORMS.values()
                else m.group(0)
            ),
            text,
        )
        Path(xml).write_text(text)


# Print the run folder at the end of the console output.
def pytest_terminal_summary(terminalreporter):
    terminalreporter.write_line("Run: " + str(RUN_DIR.relative_to(ROOT)))
