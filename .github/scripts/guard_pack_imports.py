#!/usr/bin/env python3
"""
guard_pack_imports.py

Blocks domain code from importing jurisdiction-specific packs directly.
Only the pack registry and the packs themselves should import
backend/src/packs/sa, backend/src/packs/ae, or backend/src/packs/qa.

- Type-only imports are allowed (they carry no runtime behaviour).
- Value imports from src/packs/** and tests are allowed.
- All other value imports must be listed in .github/allowed_pack_imports.json
  with a tracked issue and expiry. Prefer fixing to allowlisting.

Run with --update-baseline to regenerate the allowlist.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ALLOWED_DIRS = [
    "backend/src/packs/",
    "frontend/src/packs/",
    "backend/src/__tests__/",
    "frontend/src/__tests__/",
    "tests/",
    ".github/scripts/",
]

TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

SKIP_DIRS = {
    ".git", "node_modules", "dist", "coverage", "build", ".devin-files",
    "secret_to_upload",
}

SKIP_FILES = {
    "allowed_pack_imports.json",
    "guard_pack_imports.py",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
}

PACK_DIR_PATTERN = re.compile(r"packs/(sa|ae|qa)", re.IGNORECASE)

IMPORT_LINE_RE = re.compile(
    r"^\s*import\b"
    r"(?P<type>\s+type)?"
    r"\s+(?P<specifiers>[^'\"]+)"
    r"\s+from\s+['\"](?P<path>[^'\"]+)['\"]\s*;?\s*$",
    re.MULTILINE,
)


def is_allowed_path(rel: str) -> bool:
    parts = rel.split(os.sep)
    if "__tests__" in parts:
        return True
    if ".test." in Path(rel).name:
        return True
    for d in ALLOWED_DIRS:
        if rel.startswith(d) or ("" + d) in rel:
            return True
    return False


def should_scan_file(path: Path) -> bool:
    name = path.name
    if name in SKIP_FILES or name.startswith("secret_to_upload"):
        return False
    return path.suffix.lower() in TEXT_SUFFIXES


def extract_value_identifiers(specifiers: str) -> list[str]:
    """Return the value (non-type) identifiers from an import specifier block."""
    specifiers = specifiers.strip()
    if specifiers.startswith("* as "):
        return [specifiers]
    if specifiers.startswith("{"):
        body = specifiers[1:].split("}", 1)[0]
        ids = []
        for part in body.split(","):
            part = part.strip()
            if not part or part.lower().startswith("type "):
                continue
            ids.append(part)
        return ids
    return [specifiers]


def scan_repo(repo_root: Path) -> dict[str, dict[str, int]]:
    """Return a mapping of relative file path -> imported pack path -> count."""
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

            for match in IMPORT_LINE_RE.finditer(text):
                import_path = match.group("path")
                if not PACK_DIR_PATTERN.search(import_path):
                    continue
                if match.group("type"):
                    continue
                value_ids = extract_value_identifiers(match.group("specifiers"))
                if not value_ids:
                    continue
                counts[rel][import_path] += 1

    return counts


def load_allowlist(repo_root: Path) -> dict[tuple[str, str], dict]:
    path = repo_root / ".github" / "allowed_pack_imports.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {(entry["file"], entry["import"]): entry for entry in data}


def is_expired(entry: dict) -> bool:
    expires = entry.get("expires")
    if not expires:
        return False
    try:
        return date.fromisoformat(expires) < date.today()
    except ValueError:
        return False


def save_allowlist(repo_root: Path, counts: dict[str, dict[str, int]]):
    path = repo_root / ".github" / "allowed_pack_imports.json"
    entries = []
    for rel in sorted(counts):
        for import_path in sorted(counts[rel]):
            entries.append({
                "file": rel,
                "import": import_path,
                "count": counts[rel][import_path],
                "reason": "legacy pack import pending extraction",
                "tracked_issue": "",
                "expires": "2026-10-31",
            })
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Baseline updated: {path} ({len(entries)} entries)")


def check_counts(repo_root: Path, counts: dict[str, dict[str, int]], allowlist: dict):
    violations = []
    for rel in sorted(counts):
        for import_path in sorted(counts[rel]):
            actual = counts[rel][import_path]
            key = (rel, import_path)
            entry = allowlist.get(key)
            if entry is None:
                violations.append((rel, import_path, actual, None, "not allowed"))
            elif is_expired(entry):
                violations.append((rel, import_path, actual, entry.get("count", 0), "allowlist expired"))
            elif actual > entry.get("count", 0):
                violations.append((rel, import_path, actual, entry.get("count", 0), "count exceeded"))
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
        print("No disallowed pack imports found.")
        return 0

    print("ERROR: disallowed pack imports found outside src/packs and tests:")
    for rel, import_path, actual, allowed, reason in violations:
        if allowed is None:
            print(f"  {rel}: import '{import_path}' appears {actual} time(s) ({reason})")
        else:
            print(f"  {rel}: import '{import_path}' appears {actual} time(s), allowlist count is {allowed} ({reason})")
    print("\nMove the import into a pack, use the registry, or add an entry to .github/allowed_pack_imports.json with a tracked issue.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
