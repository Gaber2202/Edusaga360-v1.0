#!/usr/bin/env python3
"""Enumerate jurisdiction-read patterns and verify guard behaviour.

This is a fixture-based proof of the regex guard in guard_jurisdiction_resolution.py.
It runs the guard against synthetic files and reports both what the regex catches
today and the patterns that an AST-based checker would be needed for.
"""

import importlib.util
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

# Import the guard script as a module so we can test its functions directly.
_GUARD_PATH = Path(__file__).resolve().parent / "guard_jurisdiction_resolution.py"
_guard_spec = importlib.util.spec_from_file_location("guard_jurisdiction_resolution", _GUARD_PATH)
guard = importlib.util.module_from_spec(_guard_spec)
_guard_spec.loader.exec_module(guard)


def make_fixture(content: str) -> Path:
    """Write content to a temporary file outside the repo and return its path."""
    with tempfile.NamedTemporaryFile("w", suffix=".ts", delete=False) as f:
        f.write(content)
        return Path(f.name)


# Patterns the regex guard MUST catch. Each is a (description, line) tuple.
MUST_CATCH = [
    ("dot read tenant lower", "tenant.jurisdiction_code"),
    ("dot read branch lower", "branch.jurisdiction_code"),
    ("dot read tenant camel", "tenant.jurisdictionCode"),
    ("dot read branch camel", "branch.jurisdictionCode"),
    ("optional chain tenant lower", "tenant?.jurisdiction_code"),
    ("optional chain branch lower", "branch?.jurisdiction_code"),
    ("optional chain tenant camel", "tenant?.jurisdictionCode"),
    ("optional chain branch camel", "branch?.jurisdictionCode"),
    ("optional chain with spaces", "tenant ? . jurisdiction_code"),
    ("bracket read double quotes tenant", 'tenant["jurisdiction_code"]'),
    ("bracket read double quotes branch", 'branch["jurisdiction_code"]'),
    ("bracket read single quotes tenant", "tenant['jurisdiction_code']"),
    ("bracket read single quotes branch", "branch['jurisdiction_code']"),
    ("destructure lower tenant", "const { jurisdiction_code } = tenant"),
    ("destructure lower branch", "const { jurisdiction_code } = branch"),
    ("destructure camel tenant alias", "const { jurisdictionCode: jc } = tenant"),
    ("destructure camel branch alias", "const { jurisdictionCode: jc } = branch"),
    ("equality read", "tenant.jurisdiction_code === 'SA'"),
    ("nested optional branch", "x?.branch?.jurisdiction_code"),
]

# Patterns the guard MUST NOT flag (legitimate writes / object keys).
MUST_ALLOW = [
    ("assignment dot", "tenant.jurisdiction_code = 'SA';"),
    ("assignment optional", "tenant?.jurisdiction_code = 'SA';"),
    ("assignment bracket", 'tenant["jurisdiction_code"] = "SA";'),
    ("object key dot shorthand", "const payload = { jurisdiction_code: 'SA' };"),
    ("object key tenant prefix", "const payload = { tenant: { jurisdiction_code: 'SA' } };"),
    ("insert spread", "insert({ ...data, jurisdiction_code: 'SA' })"),
    ("type interface", "jurisdiction_code: string;"),
    ("function param", "function setCode(jurisdiction_code: string) {}"),
]

# Patterns an AST/data-flow checker is required for; a regex cannot reliably flag
# arbitrary variable names or string column names without huge false positives.
# The current guard intentionally targets only the canonical identifiers `tenant`
# and `branch`; all other variable aliases and DB column strings are out of scope.
KNOWN_UNCATCHABLE_BY_REGEX = [
    "data.jurisdiction_code",
    "row.jurisdiction_code",
    "t.jurisdiction_code",
    "supabase.from('tenants').select('jurisdiction_code')",
]


def test_must_catch() -> list[str]:
    """Return list of descriptions that were NOT caught."""
    failures = []
    for desc, line in MUST_CATCH:
        path = make_fixture(line + "\n")
        findings = guard.check_file(path)
        path.unlink(missing_ok=True)
        if not findings:
            failures.append(f"MUST_CATCH missed: {desc} -> {line!r}")
    return failures


def test_must_allow() -> list[str]:
    """Return list of descriptions that were incorrectly flagged."""
    failures = []
    for desc, line in MUST_ALLOW:
        path = make_fixture(line + "\n")
        findings = guard.check_file(path)
        path.unlink(missing_ok=True)
        if findings:
            failures.append(f"MUST_ALLOW flagged: {desc} -> {line!r} ({findings})")
    return failures


def test_allowed_files() -> list[str]:
    """Return list of real files that should be exempt and were flagged."""
    failures = []
    for p in guard.ALLOWED_FILES:
        if p.is_file():
            findings = guard.check_file(p)
            if findings:
                failures.append(f"Allowed file flagged: {p}: {findings}")
    return failures


def test_main_on_repo() -> list[str]:
    """Run the guard over the repo and return any findings."""
    with patch("builtins.print"):
        rc = guard.main()
    if rc != 0:
        return [f"guard.main() returned {rc}; see output above for findings"]
    return []


def main() -> int:
    failures: list[str] = []
    failures.extend(test_must_catch())
    failures.extend(test_must_allow())
    failures.extend(test_allowed_files())
    failures.extend(test_main_on_repo())

    if failures:
        print("FAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("OK: guard catches all MUST_CATCH patterns, allows all MUST_ALLOW patterns, and the repo is clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
