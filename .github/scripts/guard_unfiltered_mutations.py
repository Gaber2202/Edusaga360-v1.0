#!/usr/bin/env python3
"""
guard_unfiltered_mutations.py

Fails CI if any tenantQuery/supabase.from UPDATE/DELETE chain in the frontend
is missing a row-level filter (.eq, .match, .in, .filter, .neq) before
execution. Multi-line chains are parsed correctly.

When --diff-base is supplied the guard only reports violations that appear on
lines changed in the diff. This lets PRs touch files that still contain
pre-existing unfiltered mutations while blocking newly introduced ones.

Allow a specific site by putting a comment on the same or previous line:
  // guard-allow-unfiltered: <reason>
"""
import argparse
import re
import subprocess
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
DIFF_HUNK_RE = re.compile(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


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
    region_start = text.rfind("\n", 0, chain_start) + 1
    for _ in range(3):
        prev = text.rfind("\n", 0, region_start - 1) + 1 if region_start > 0 else 0
        if prev == region_start:
            break
        region_start = prev
    region = text[region_start : chain_start + 400]
    return bool(ALLOW_RE.search(region))


def scan_file(path: Path, repo_root: Path, changed_lines=None):
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
        if changed_lines is not None and not any(s <= line <= e for s, e in changed_lines):
            continue
        rel = path.relative_to(repo_root).as_posix()
        violations.append((rel, line, table, op))
    return violations


def get_diff_ranges(diff_base: str, files: list[Path] | None, cwd: Path):
    """Return {repo_relative_path: [(start_line, end_line), ...]} for lines changed in the diff."""
    cmd = ["git", "diff", "-U0", "--diff-filter=AM", diff_base]
    if files:
        cmd.append("--")
        for p in files:
            cmd.append(str(p))
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return {}
    if result.returncode != 0:
        return {}

    ranges = {}
    current_file = None
    for line in result.stdout.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:]
            ranges.setdefault(current_file, [])
        elif line.startswith("@@") and current_file:
            m = DIFF_HUNK_RE.match(line)
            if not m:
                continue
            _, _, new_start, new_count = m.groups()
            new_start = int(new_start)
            new_count = int(new_count or "1")
            if new_count == 0:
                continue
            start = new_start if new_start > 0 else 1
            end = start + new_count - 1
            ranges[current_file].append((start, end))
    return ranges


def _under_path(rel: str, path_prefix: str | None) -> bool:
    if path_prefix is None:
        return True
    return rel == path_prefix or rel.startswith(path_prefix + "/")


def _is_in_path(p: Path, path: Path) -> bool:
    try:
        p.relative_to(path)
        return True
    except ValueError:
        return False


def resolve_files(args, repo_root: Path):
    path_prefix = None
    if args.path.is_absolute() or _is_in_path(args.path.resolve(), repo_root):
        try:
            path_prefix = args.path.resolve().relative_to(repo_root).as_posix()
        except ValueError:
            pass

    if args.diff_base:
        diff_ranges = get_diff_ranges(args.diff_base, args.files, repo_root)
        if not diff_ranges:
            return {}
        entries = {}
        for rel, ranges in diff_ranges.items():
            if path_prefix is not None and not _under_path(rel, path_prefix):
                continue
            p = repo_root / rel
            if not p.is_file():
                continue
            entries[rel] = (p, repo_root, ranges)
        return entries

    if args.files:
        entries = {}
        for raw in args.files:
            p = raw.resolve() if not raw.is_absolute() else raw
            if not p.is_file():
                continue
            if _is_in_path(p, repo_root):
                rel = p.relative_to(repo_root).as_posix()
                root = repo_root
            else:
                rel = p.name
                root = p.parent
            if not _under_path(rel, path_prefix):
                continue
            entries[rel] = (p, root, None)
        return entries

    scan_root = args.path.resolve()
    entries = {}
    for raw in args.path.rglob("*"):
        p = raw.resolve()
        if not p.is_file():
            continue
        if p.suffix not in (".js", ".jsx", ".ts", ".tsx"):
            continue
        if ".test." in p.name or "__tests__" in p.parts:
            continue
        try:
            rel = p.relative_to(scan_root).as_posix()
        except ValueError:
            rel = p.name
        entries[rel] = (p, scan_root, None)
    return entries


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
    parser.add_argument(
        "--diff-base",
        dest="diff_base",
        help="Git ref to diff against; only report violations on changed lines.",
    )
    args = parser.parse_args()

    # The script lives at .github/scripts/, so three parents up is the repo root.
    repo_root = Path(__file__).parent.parent.parent

    entries = resolve_files(args, repo_root)
    violations = []
    for rel, (p, rel_root, changed_lines) in entries.items():
        violations.extend(scan_file(p, rel_root, changed_lines))

    if violations:
        print(f"ERROR: {len(violations)} unfiltered UPDATE/DELETE chain(s) found:")
        for rel, line, table, op in violations:
            print(f"  {rel}:{line}  {op} on {table}")
        sys.exit(1)

    if args.diff_base:
        print(f"Scanned changed frontend source; no new unfiltered UPDATE/DELETE chains found.")
    else:
        print(f"Scanned frontend source; no unfiltered UPDATE/DELETE chains found.")
    sys.exit(0)


if __name__ == "__main__":
    main()
