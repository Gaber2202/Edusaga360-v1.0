#!/usr/bin/env python3
"""Fail CI if jurisdiction is resolved outside the jurisdiction module.

resolveJurisdiction() in backend/src/lib/jurisdiction.ts is the ONLY allowed
source of truth for jurisdiction. Any direct read of `tenant.jurisdiction_code`,
`branch.jurisdiction_code`, `tenant.jurisdictionCode`, or `branch.jurisdictionCode`
outside the jurisdiction module is a bug: it bypasses branch->tenant fallback and
can silently use the wrong jurisdiction for a multi-campus school.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The one module allowed to read jurisdiction fields directly.
JURISDICTION_MODULE = ROOT / "backend" / "src" / "lib" / "jurisdiction.ts"

# Files that are allowed to use the literal column name in SQL or data payloads
# without calling resolveJurisdiction().
ALLOWED_FILES = {
    # Migrations and seeds legitimately insert the column value.
    ROOT / "shared" / "database" / "migrations",
    ROOT / "shared" / "database" / "schema.sql",
    ROOT / "backend" / "src" / "scripts",
    # The guard script itself.
    ROOT / ".github" / "scripts" / "guard_jurisdiction_resolution.py",
    # Tests may construct literal objects for the resolver under test.
    ROOT / "backend" / "src" / "__tests__" / "jurisdiction.test.ts",
}

SCAN_DIRS = [
    ROOT / "backend" / "src",
    ROOT / "frontend" / "src",
    ROOT / "admin-portal" / "src",
    ROOT / "parent-portal" / "src",
    ROOT / "shared" / "database",
    ROOT / ".agents" / "skills",
    ROOT / "supabase",
]

EXTRA_FILES = [ROOT / "shared" / "database" / "schema.sql"]

SKIP_DIRS = {"node_modules", ".git"}

# Match direct property reads on the canonical `tenant` and `branch` identifiers.
# Covers dot access, optional chaining, bracket access with string literals, and
# simple single-line destructuring. Multi-line destructuring and arbitrary
# variable aliases (e.g. `data.jurisdiction_code`) require an AST-based check.
PROPERTY_READ_RE = re.compile(
    r"\b(tenant|branch)\b\s*\?{0,1}\s*(?:\.\s*(jurisdiction_code|jurisdictionCode)|\[\s*['\"](jurisdiction_code|jurisdictionCode)['\"]\s*\])",
    re.IGNORECASE,
)

DESTRUCTURING_RE = re.compile(
    r"\b(?:const|let|var)\s*\{\s*[^}]*?\b(jurisdiction_code|jurisdictionCode)\b(?:\s*:\s*\w+)?\b[^}]*?\}\s*=\s*(?:[\w$]*\.)?(tenant|branch)\b",
    re.IGNORECASE,
)


def is_allowed(path: Path) -> bool:
    if path == JURISDICTION_MODULE:
        return True
    for allowed in ALLOWED_FILES:
        if path == allowed:
            return True
        try:
            path.relative_to(allowed)
            return True
        except ValueError:
            pass
    return False


def _is_write(line: str, matched_text: str) -> bool:
    """Return True if `matched_text` on `line` is the target of an assignment."""
    # A single `=` only; `==`/`===` comparisons and `?:` ternaries are reads.
    return bool(re.search(rf"{re.escape(matched_text)}\s*=(?!=)", line))


def check_file(path: Path) -> list[str]:
    if is_allowed(path):
        return []
    raw = path.read_text(encoding="utf-8", errors="ignore")
    findings = []
    for lineno, line in enumerate(raw.splitlines(), start=1):
        for m in PROPERTY_READ_RE.finditer(line):
            if _is_write(line, m.group(0)):
                continue
            findings.append(f"line {lineno}: direct read `{m.group(0)}`")
        for m in DESTRUCTURING_RE.finditer(line):
            findings.append(f"line {lineno}: direct read `{m.group(0)}`")
    return findings


def main() -> int:
    all_files = list(EXTRA_FILES)
    for d in SCAN_DIRS:
        if not d.exists():
            continue
        for p in d.rglob("*"):
            if p.is_dir():
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            if p.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".sql"}:
                all_files.append(p)

    errors = 0
    for p in all_files:
        findings = check_file(p)
        if findings:
            errors += len(findings)
            print(f"\n{p.relative_to(ROOT)}")
            for f in findings:
                print(f"  - {f}")

    if errors:
        print(
            f"\nError: found {errors} direct jurisdiction read(s) outside {JURISDICTION_MODULE.relative_to(ROOT)}. "
            "Use resolveJurisdiction() from backend/src/lib/jurisdiction.ts."
        )
        return 1

    print("OK: no direct jurisdiction reads found outside the jurisdiction module.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
