#!/usr/bin/env python3
"""
guard_schema_drift.py

Blocks frontend Supabase queries from referencing tables that are not in the
production schema, and blocks `.order()` calls with no column argument.

- `tenantQuery('table_name')` and `supabase.from('table_name')` literal table
  names are checked against `.github/production_tables.json`.
- Any literal table name not in that list is flagged unless it is in
  `.github/allowed_schema_drift.json` with a count and expiry.
- `.order()` with an empty/undefined argument is also flagged; existing
  occurrences are grandfathered through the allowlist.

Run with --update-baseline to regenerate the allowlist from the current tree.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend" / "src"
PROD_TABLES_FILE = REPO_ROOT / ".github" / "production_tables.json"
ALLOWLIST_FILE = REPO_ROOT / ".github" / "allowed_schema_drift.json"

# Match tenantQuery('literal'), tenantQuery("literal"), supabase.from('literal'),
# and generic .from('literal') chained calls.
TABLE_REF_RE = re.compile(
    r"(?:tenantQuery|supabase\.from|\.from)\s*\(\s*['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]\s*\)")

# Match .order() with no/empty/undefined argument. We intentionally do not
# evaluate variables here, only literal no-arg or explicit 'undefined'/null.
BAD_ORDER_RE = re.compile(
    r"\.order\s*\(\s*(?:undefined|null|'undefined'|\"undefined\"|'\"|\"')?\s*\)")

CODE_SUFFIXES = {".js", ".jsx", ".ts", ".tsx"}
SKIP_DIRS = {".git", "node_modules", "dist", "coverage", "build", ".devin-files"}


def load_production_tables() -> set[str]:
    return set(json.loads(PROD_TABLES_FILE.read_text(encoding="utf-8")))


def load_allowlist() -> dict[tuple[str, str, str], dict]:
    if not ALLOWLIST_FILE.exists():
        return {}
    entries = json.loads(ALLOWLIST_FILE.read_text(encoding="utf-8"))
    out = {}
    for e in entries:
        key = (e.get("file", ""), e.get("table", ""), e.get("issue", ""))
        out[key] = e
    return out


def save_allowlist(counts: dict[tuple[str, str, str], int]):
    entries = []
    for (rel, table, issue), count in sorted(counts.items()):
        entries.append({
            "file": rel,
            "table": table,
            "issue": issue,
            "count": count,
            "reason": "legacy schema-drift reference pending fix",
            "tracked_issue": "",
            "expires": "2026-12-31",
        })
    ALLOWLIST_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Baseline updated: {ALLOWLIST_FILE} ({len(entries)} entries)")


def is_expired(entry: dict) -> bool:
    expires = entry.get("expires")
    if not expires:
        return False
    try:
        return date.fromisoformat(expires) < date.today()
    except ValueError:
        return False


def scan_frontend():
    """Return two dicts: table_ref_counts[(rel,table)], bad_order_counts[(rel,table)]."""
    table_counts: dict[tuple[str, str], int] = defaultdict(int)
    order_counts: dict[tuple[str, str], int] = defaultdict(int)

    for root, dirs, files in os.walk(FRONTEND):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            p = Path(root) / f
            if p.suffix.lower() not in CODE_SUFFIXES:
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            rel = p.relative_to(REPO_ROOT).as_posix()

            # Table references
            for m in TABLE_REF_RE.finditer(text):
                table_counts[(rel, m.group(1))] += 1

            # Bad .order() calls
            for m in BAD_ORDER_RE.finditer(text):
                # Best-effort: attach to the most recent tenantQuery/supabase.from
                # table name in the same line/chunk. If none, mark as 'unknown'.
                line_start = text.rfind("\n", 0, m.start()) + 1
                line_end = text.find("\n", m.start())
                if line_end == -1:
                    line_end = len(text)
                line = text[line_start:line_end]
                nearest = None
                for tm in TABLE_REF_RE.finditer(line):
                    nearest = tm.group(1)
                order_counts[(rel, nearest or "unknown")] += 1

    return table_counts, order_counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-baseline", action="store_true")
    args = parser.parse_args()

    if not PROD_TABLES_FILE.exists():
        print(f"ERROR: {PROD_TABLES_FILE} not found. Generate it from information_schema.")
        return 1

    prod_tables = load_production_tables()
    table_counts, order_counts = scan_frontend()

    # Merge counts; use full key (rel, table, issue)
    full_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    for (rel, table), count in table_counts.items():
        if table.lower() not in prod_tables:
            full_counts[(rel, table, "unknown_table")] += count
    for (rel, table), count in order_counts.items():
        full_counts[(rel, table, "bad_order")] += count

    if args.update_baseline:
        save_allowlist(full_counts)
        return 0

    allowlist = load_allowlist()
    violations = []

    for (rel, table, issue), count in sorted(full_counts.items()):
        key = (rel, table, issue)
        entry = allowlist.get(key)
        if entry is None:
            violations.append((rel, table, issue, count, None, "not allowed"))
        elif is_expired(entry):
            violations.append((rel, table, issue, count, entry.get("count", 0), "allowlist expired"))
        elif count > entry.get("count", 0):
            violations.append((rel, table, issue, count, entry.get("count", 0), "count exceeded"))

    if not violations:
        print("No new schema-drift violations found.")
        return 0

    print("ERROR: new schema-drift violations found:")
    for rel, table, issue, actual, allowed, reason in violations:
        if allowed is None:
            print(f"  {rel}: '{table}' {issue} appears {actual} time(s) ({reason})")
        else:
            print(f"  {rel}: '{table}' {issue} appears {actual} time(s), allowlist count is {allowed} ({reason})")
    print("\nUse the correct production table name, remove the .order() with no argument,")
    print("or run with --update-baseline if these are existing/tracked exceptions.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
