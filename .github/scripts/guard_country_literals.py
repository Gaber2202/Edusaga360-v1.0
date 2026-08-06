#!/usr/bin/env python3
"""
guard_country_literals.py

Country-literal lint for the jurisdiction layer.

Fails CI if any of the forbidden Saudi/GCC-specific literals appear outside
allowed directories (src/packs/**, supabase/migrations/**,
shared/database/migrations/**, tests/**) and are not covered by the interim
allowlist.

Run with --update-baseline to regenerate .github/allowed_country_literals.json
from the current codebase.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

# Named literals are matched case-insensitively as substrings, because they
# appear in identifiers, table names, comments and string values.
NAMED_TERMS = [
    "ZATCA", "Nafath", "Moyasar", "Nitaqat", "GOSI", "Qiwa", "Mudad", "Muqeem",
    "SADAD", "Asia/Riyadh", "halala",
]

# Currency codes must appear as standalone tokens. They are also accepted when
# quoted ('SAR', "SAR"). They are NOT matched when they are part of an
# identifier (e.g. the shared sar() rounding helper) or a hyphenated word.
CURRENCY_TERMS = ["SAR", "AED", "QAR"]

ALLOWED_DIRS = [
    "src/packs/",
    "supabase/migrations/",
    "shared/database/migrations/",
    "tests/",
    "load/",
    ".github/scripts/",
]

TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".html",
    ".py", ".sh", ".edge",
}

SKIP_DIRS = {
    ".git", "node_modules", "dist", "coverage", "build", ".devin-files",
    "secret_to_upload",
}

SKIP_FILES = {
    "allowed_country_literals.json",
    "guard_country_literals.py",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
}


def build_term_pattern(term: str) -> re.Pattern:
    """Build a case-insensitive regex for one forbidden term."""
    if term in CURRENCY_TERMS:
        # Standalone token, not part of an identifier or hyphenated word,
        # and not followed immediately by '(' (function call).
        pattern = (
            r"(?<![A-Za-z0-9_-])"
            + re.escape(term)
            + r"(?![A-Za-z0-9_-])(?![(])"
        )
    else:
        pattern = re.escape(term)
    return re.compile(pattern, re.IGNORECASE)


TERM_PATTERNS: dict[str, re.Pattern] = {
    term.lower(): build_term_pattern(term) for term in (NAMED_TERMS + CURRENCY_TERMS)
}


def is_allowed_path(rel: str) -> bool:
    """Return True if the path is inside an allowed directory or is a test file."""
    if any(part in rel.split(os.sep) for part in ("__tests__", "tests")):
        return True
    if rel.endswith(".test.ts") or rel.endswith(".test.tsx") or rel.endswith(".test.js") or rel.endswith(".test.jsx"):
        return True
    for d in ALLOWED_DIRS:
        if rel.startswith(d) or ("/" + d) in rel:
            return True
    return False


def should_scan_file(path: Path) -> bool:
    name = path.name
    if name in SKIP_FILES:
        return False
    if name.startswith("secret_to_upload"):
        return False
    if path.suffix.lower() not in TEXT_SUFFIXES:
        return False
    return True


def scan_repo(repo_root: Path):
    """Walk repo and count forbidden term occurrences per file."""
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for root, dirs, files in os.walk(repo_root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            p = Path(root) / f
            if not should_scan_file(p):
                continue
            rel = p.relative_to(repo_root).as_posix()
            if is_allowed_path(rel):
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for term, pattern in TERM_PATTERNS.items():
                for _ in pattern.finditer(text):
                    counts[rel][term] += 1
    return counts


def load_allowlist(repo_root: Path) -> dict[tuple[str, str], dict]:
    path = repo_root / ".github" / "allowed_country_literals.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    result = {}
    for entry in data:
        key = (entry["file"], entry["term"])
        result[key] = entry
    return result


def is_expired(entry: dict) -> bool:
    expires = entry.get("expires")
    if not expires:
        return False
    try:
        return date.fromisoformat(expires) < date.today()
    except ValueError:
        return False


def save_allowlist(repo_root: Path, counts: dict[str, dict[str, int]]):
    path = repo_root / ".github" / "allowed_country_literals.json"
    entries = []
    for rel in sorted(counts):
        for term in sorted(counts[rel]):
            entries.append({
                "file": rel,
                "term": term,
                "count": counts[rel][term],
                "reason": "legacy Saudi-specific code pending jurisdiction extraction",
                "expires": "2026-10-31",
            })
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Baseline updated: {path} ({len(entries)} entries)")


def check_counts(repo_root: Path, counts: dict[str, dict[str, int]], allowlist: dict):
    violations = []
    for rel in sorted(counts):
        for term in sorted(counts[rel]):
            actual = counts[rel][term]
            key = (rel, term)
            entry = allowlist.get(key)
            if entry is None:
                violations.append((rel, term, actual, None, "not allowed"))
            elif is_expired(entry):
                violations.append((rel, term, actual, entry.get("count", 0), "allowlist expired"))
            elif actual > entry.get("count", 0):
                violations.append((rel, term, actual, entry.get("count", 0), "count exceeded"))
    return violations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-baseline", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    counts = scan_repo(repo_root)

    if args.update_baseline:
        save_allowlist(repo_root, counts)
        return 0

    allowlist = load_allowlist(repo_root)
    violations = check_counts(repo_root, counts, allowlist)

    if not violations:
        print("No unallowed country literals found.")
        return 0

    print("ERROR: unallowed country literals found outside src/packs and tests:")
    for rel, term, actual, allowed, reason in violations:
        if allowed is None:
            print(f"  {rel}: term '{term}' appears {actual} time(s) ({reason})")
        else:
            print(f"  {rel}: term '{term}' appears {actual} time(s), allowlist count is {allowed} ({reason})")
    print("\nAdd allowed entries to .github/allowed_country_literals.json, or move the code into a country pack.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
