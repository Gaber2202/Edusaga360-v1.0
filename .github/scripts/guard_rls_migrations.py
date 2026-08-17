#!/usr/bin/env python3
"""Fail CI if any changed migration (or the schema baseline) reintroduces legacy tenant-isolation patterns.

The legacy patterns are:
- current_setting('request.jwt.claims')
- current_setting('app.tenant_id')
- auth.jwt() ->> 'tenant_id'   (top-level, not via app_metadata)

Use public.auth_tenant_id() and public.auth_is_platform_owner() instead.
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_DIR = REPO_ROOT / "shared" / "database" / "migrations"
SCHEMA_SQL = REPO_ROOT / "shared" / "database" / "schema.sql"

FORBIDDEN = [
    (
        "current_setting('request.jwt.claims')",
        re.compile(
            r"current_setting\s*\(\s*'+request\.jwt\.claims'+\s*(?:::\w+)?\s*(?:,\s*true)?\s*\)",
            re.IGNORECASE,
        ),
    ),
    (
        "current_setting('app.tenant_id')",
        re.compile(
            r"current_setting\s*\(\s*'+app\.tenant_id'+\s*(?:::\w+)?\s*(?:,\s*true)?\s*\)",
            re.IGNORECASE,
        ),
    ),
    (
        "auth.jwt() ->> 'tenant_id'",
        re.compile(r"auth\.jwt\s*\(\s*\)\s*->>\s*'+tenant_id'+\s*(?:::\w+)?", re.IGNORECASE),
    ),
]


def _ensure_ref(ref: str) -> None:
    """Fetch the base ref if it is not already available (e.g. shallow CI checkouts)."""
    try:
        subprocess.run(
            ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        remote_branch = ref.split("/", 1)[1] if ref.startswith("origin/") else ref
        try:
            subprocess.run(
                ["git", "fetch", "origin", f"+refs/heads/{remote_branch}:refs/remotes/origin/{remote_branch}"],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            print(f"Could not fetch {remote_branch} from origin: {exc.stderr}")
            sys.exit(1)


def changed_files(args_base: str | None = None) -> list[Path]:
    base = args_base or os.environ.get("GITHUB_BASE_REF", "main")
    if not base.startswith(("refs/", "origin/")):
        base = f"origin/{base}"
    _ensure_ref(base)
    try:
        merge_base = subprocess.check_output(
            ["git", "merge-base", base, "HEAD"], text=True, stderr=subprocess.PIPE
        ).strip()
    except subprocess.CalledProcessError as exc:
        print(f"Could not find merge base between {base} and HEAD: {exc.stderr}")
        sys.exit(1)
    if not merge_base:
        print(f"Could not find merge base between {base} and HEAD")
        sys.exit(1)
    pathspecs = [str(MIGRATION_DIR), str(SCHEMA_SQL)]
    try:
        # Only consider added/copied/modified/renamed/type-changed files. Deleted
        # files are excluded because there is nothing to scan.
        output = subprocess.check_output(
            ["git", "diff", "--name-only", "--diff-filter=ACMRT", merge_base, "--", *pathspecs],
            text=True,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as exc:
        print(f"Could not diff against {merge_base}: {exc.stderr}")
        sys.exit(1)

    paths = []
    for line in output.strip().split("\n"):
        if not line:
            continue
        path = REPO_ROOT / line
        if not path.exists():
            # A file reported by git diff but not on disk is a setup error; fail
            # loudly rather than silently passing.
            print(f"Could not find file reported by git diff: {line}")
            sys.exit(1)
        paths.append(path)
    return paths


def check_files(paths: list[Path]) -> int:
    failures = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for name, pattern in FORBIDDEN:
            for match in pattern.finditer(text):
                line = text[: match.start()].count("\n") + 1
                failures.append(f"{path.relative_to(REPO_ROOT)}:{line}: forbidden pattern {name!r}")

    if failures:
        print("Legacy RLS patterns found:")
        for f in failures:
            print(f"  {f}")
        print("Use public.auth_tenant_id() and public.auth_is_platform_owner() instead.")
        return 1

    print(f"Scanned {len(paths)} file(s); no legacy RLS patterns found.")
    return 0


def all_files() -> list[Path]:
    migrations = sorted(MIGRATION_DIR.glob("*.sql"))
    return migrations + [SCHEMA_SQL]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        help="Check every migration plus schema.sql in the repository, not just changed files.",
    )
    parser.add_argument(
        "--base",
        help="Base ref to diff against (defaults to GITHUB_BASE_REF or origin/main).",
    )
    args = parser.parse_args()

    paths = all_files() if args.all else changed_files(args.base)
    if not paths:
        print("No migration files to check.")
        return 0
    return check_files(paths)


if __name__ == "__main__":
    sys.exit(main())
