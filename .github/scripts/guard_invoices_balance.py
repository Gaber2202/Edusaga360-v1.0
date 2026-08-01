#!/usr/bin/env python3
"""Fail CI if any code path writes to invoices.balance.

invoices.balance is a generated column. Any INSERT/UPDATE that includes it
will throw at runtime. This guard scans source, migrations, scripts, and
documentation for direct and variable-payload writes.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_DIRS = [
    ROOT / "backend" / "src",
    ROOT / "frontend" / "src",
    ROOT / "admin-portal" / "src",
    ROOT / "parent-portal" / "src",
    ROOT / "shared" / "database" / "migrations",
    ROOT / ".agents" / "skills",
    ROOT / "supabase",
]

# Optional: a project-wide schema.sql if it ever reappears.
EXTRA_FILES = [ROOT / "shared" / "database" / "schema.sql"]

# Remove test files from guard scope: test mocks return balance, they do not
# perform DB writes, and the global .from('invoices') patterns do not appear in
# them.
SKIP_DIRS = {"__tests__", "node_modules", ".git"}


def strip_line_comments(text: str) -> str:
    lines = text.splitlines()
    out = []
    for line in lines:
        if "//" in line:
            line = line[: line.index("//")]
        out.append(line)
    return "\n".join(out)


def strip_block_comments(text: str) -> str:
    # naive but sufficient for the patterns we are checking
    while "/*" in text and "*/" in text:
        start = text.index("/*")
        end = text.index("*/", start) + 2
        text = text[:start] + "\n" + text[end:]
    return text


def clean_text(text: str) -> str:
    return strip_line_comments(strip_block_comments(text))


def extract_balanced(text: str, start: int, open_chars: str = "({[", close_chars: str = ")}]") -> tuple[str, int]:
    """Extract the substring starting at `start` whose first char is an opener.

    Returns (content_without_outer_delimiters, index_after_closing_delimiter).
    """
    stack = []
    i = start
    while i < len(text):
        c = text[i]
        if c in open_chars:
            stack.append(c)
        elif c in close_chars:
            if not stack:
                break
            o = open_chars[close_chars.index(c)]
            if stack[-1] != o:
                break
            stack.pop()
            if not stack:
                return text[start + 1 : i], i + 1
        i += 1
    return "", i


def has_property(obj_text: str, key: str) -> bool:
    """Return True if an object literal contains `key` as a top-level property."""
    # This handles shorthand/property text; keys are word-like before ':'.
    return re.search(rf"^\s*{re.escape(key)}\s*:", obj_text, re.MULTILINE) is not None


def check_sql(content: str) -> list[str]:
    findings = []
    # INSERT INTO invoices (...) with balance in column list
    for m in re.finditer(
        r"INSERT\s+INTO\s+invoices\s*\(([^)]+)\)",
        content,
        re.IGNORECASE | re.DOTALL,
    ):
        cols = m.group(1)
        if re.search(r"\bbalance\b", cols, re.IGNORECASE):
            findings.append("INSERT INTO invoices includes `balance` column")
    # UPDATE invoices ... SET ... balance = ...
    for m in re.finditer(
        r"UPDATE\s+invoices\b[^;]*?\bbalance\s*=",
        content,
        re.IGNORECASE | re.DOTALL,
    ):
        findings.append("UPDATE invoices sets `balance`")
    return findings


def check_code(content: str) -> list[str]:
    findings = []
    # Pattern: .from('invoices').insert(...) or .update(...)
    for m in re.finditer(
        r"\.from\(\s*(['\"])invoices\1\s*\)\s*\.\s*(insert|update)\s*\(",
        content,
        re.IGNORECASE | re.DOTALL,
    ):
        op = m.group(2)
        arg, _ = extract_balanced(content, m.end() - 1)
        if not arg:
            continue
        arg = arg.strip()

        # Direct object literal argument
        if arg.startswith("{"):
            if has_property(arg, "balance"):
                findings.append(f".from('invoices').{op}({{ balance: ... }})")
            continue

        # Variable argument: search the file for its definition with balance
        var = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*$", arg)
        if not var:
            continue
        var_name = var.group(1)

        # const/let X = { ... balance ... }
        obj_decl = re.search(
            rf"(?:const|let)\s+{re.escape(var_name)}\s*:\s*[^={{]*?=\s*\{{",
            content,
            re.DOTALL,
        )
        if obj_decl:
            inner, _ = extract_balanced(content, obj_decl.end() - 1)
            if has_property(inner, "balance"):
                findings.append(f"{op} payload variable `{var_name}` contains balance")
            continue

        # const/let X = [ { ... balance ... }, ... ]
        arr_decl = re.search(
            rf"(?:const|let)\s+{re.escape(var_name)}\s*:\s*[^=\[]*?=\s*\[",
            content,
            re.DOTALL,
        )
        if arr_decl:
            inner, _ = extract_balanced(content, arr_decl.end() - 1)
            # crude: any object in the array has balance?
            if re.search(r"\bbalance\s*:", inner):
                findings.append(f"{op} payload array `{var_name}` contains balance")

    return findings


def check_file(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    findings = []
    if path.suffix in {".sql"}:
        findings = check_sql(raw)
    elif path.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs"}:
        cleaned = clean_text(raw)
        findings = check_code(cleaned)
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
            if p.suffix in {".sql", ".ts", ".tsx", ".js", ".jsx", ".mjs"}:
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
            f"\nError: found {errors} place(s) that write to invoices.balance. "
            "Remove them; invoices.balance is a generated column."
        )
        return 1

    print("OK: no writes to invoices.balance found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
