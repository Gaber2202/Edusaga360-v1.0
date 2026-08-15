#!/usr/bin/env python3
"""
guard_unfiltered_mutations.py

Fails CI if any tenantQuery/supabase.from UPDATE/DELETE chain in the frontend
is missing a row-level filter (.eq, .match, .in, .filter, .neq) before
execution. Multi-line chains are parsed correctly.

Allow a specific site by putting a comment on the same or previous line:
  // guard-allow-unfiltered: <reason>
"""
import argparse
import re
import sys
from pathlib import Path

FILTER_PATTERNS = [
    r"\.eq\(",
    r"\.not\.eq\(",
    r"\.neq\(",
    r"\.not\.neq\(",
    r"\.match\(",
    r"\.in\(",
    r"\.not\.in\(",
    r"\.filter\(",
    r"\.is\(",
    r"\.not\.is\(",
    r"\.like\(",
    r"\.ilike\(",
    r"\.contains\(",
    r"\.containedBy\(",
    r"\.range\(",
    r"\.not\.range\(",
    r"\.or\(",
    r"\.and\(",
]
FILTER_RE = re.compile("|".join(FILTER_PATTERNS))
SOURCE_RE = re.compile(r"(tenantQuery|supabase\.from)\s*\(\s*['\"]([^'\"]+)['\"]")
OP_RE = re.compile(r"\.\s*(update|delete)\s*\(", re.IGNORECASE)
ALLOW_RE = re.compile(r"guard-allow-unfiltered\s*:\s*(.+)")


def has_top_level_semicolon(text: str, start: int, end: int) -> bool:
    i = start
    in_string = None
    escape = False
    depth = 0
    while i < end:
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_string:
                in_string = None
        else:
            if c in ('"', "'", "`"):
                in_string = c
            elif c in "({[":
                depth += 1
            elif c in ")}]":
                depth -= 1
            elif c == ";" and depth == 0:
                return True
        i += 1
    return False


def extract_statement(text: str, start: int) -> str:
    i = start
    in_string = None
    escape = False
    depth = 0
    end = len(text)
    while i < end:
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == in_string:
                in_string = None
        else:
            if c in ('"', "'", "`"):
                in_string = c
            elif c in "({[":
                depth += 1
            elif c in ")}]":
                depth -= 1
            elif c == ";" and depth == 0:
                return text[start : i + 1]
        i += 1
    return text[start:]


def get_chain(text: str, op_start: int):
    best = None
    for m in SOURCE_RE.finditer(text[:op_start]):
        if not has_top_level_semicolon(text, m.start(), op_start):
            best = m
    if best is None:
        return None, None
    return best.group(2), extract_statement(text, best.start())


def is_allowlisted(text: str, chain_start: int) -> bool:
    # Look at the few lines immediately before the source call for an allowlist comment.
    region_start = text.rfind("\n", 0, chain_start) + 1
    for _ in range(3):
        prev = text.rfind("\n", 0, region_start - 1) + 1 if region_start > 0 else 0
        if prev == region_start:
            break
        region_start = prev
    region = text[region_start : chain_start + 400]
    return bool(ALLOW_RE.search(region))


def scan_file(path: Path, repo_root: Path):
    text = path.read_text(encoding="utf-8", errors="ignore")
    violations = []
    for m in OP_RE.finditer(text):
        op = m.group(1).lower()
        table, chain = get_chain(text, m.start())
        if chain is None:
            continue
        if is_allowlisted(text, m.start()):
            continue
        if FILTER_RE.search(chain):
            continue
        line = text[: m.start()].count("\n") + 1
        rel = path.relative_to(repo_root).as_posix()
        violations.append((rel, line, table, op))
    return violations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--path",
        type=Path,
        default=Path(__file__).parent.parent.parent / "frontend" / "src",
    )
    parser.add_argument(
        "--files",
        type=Path,
        nargs="*",
        help="Optional list of files to scan instead of the full --path tree.",
    )
    args = parser.parse_args()
    root = args.path if args.path.is_dir() else args.path.parent

    violations = []
    if args.files:
        for p in args.files:
            if not p.is_file():
                continue
            if p.suffix not in (".js", ".jsx", ".ts", ".tsx"):
                continue
            if ".test." in p.name or "__tests__" in p.parts:
                continue
            if str(p).startswith(str(args.path)):
                rel_root = args.path
            else:
                rel_root = root
            violations.extend(scan_file(p, rel_root))
    else:
        for p in args.path.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix not in (".js", ".jsx", ".ts", ".tsx"):
                continue
            if ".test." in p.name or "__tests__" in p.parts:
                continue
            violations.extend(scan_file(p, root))

    if violations:
        print(f"ERROR: {len(violations)} unfiltered UPDATE/DELETE chain(s) found:")
        for rel, line, table, op in violations:
            print(f"  {rel}:{line}  {op} on {table}")
        sys.exit(1)

    print(f"Scanned frontend source; no unfiltered UPDATE/DELETE chains found.")
    sys.exit(0)


if __name__ == "__main__":
    main()
