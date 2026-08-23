#!/usr/bin/env python3
"""Fail CI if any code writes privileged auth claims to user_metadata.

Privileged keys (tenant_id, role, user_role, is_platform_owner) must live in
app_metadata only. user_metadata is user-writable and must never carry them.

This guard targets WRITE patterns only:
  - user_metadata: { tenant_id: ... } object literals (createUser / updateUserById)
  - user_metadata.tenant_id = ... direct assignment (not optional-chain reads)

Allowed exceptions:
  - syncAuthMetadata.ts (backfill script that STRIPS these keys)
  - parents.ts (explicit delete of tenant_id/role before update)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_DIRS = [
    ROOT / "backend" / "src",
    ROOT / "frontend" / "src",
    ROOT / "admin-portal" / "src",
    ROOT / "parent-portal" / "src",
]

SKIP_FILES = {
    ROOT / "backend" / "src" / "scripts" / "syncAuthMetadata.ts",
}

PRIVILEGED_KEYS = ("tenant_id", "role", "user_role", "is_platform_owner")

USER_META_OBJECT = re.compile(
    r"user_metadata\s*:\s*\{([^}]*)\}",
    re.DOTALL,
)

# Direct write: user_metadata.tenant_id = value (not ?. read)
DIRECT_WRITE = re.compile(
    r"user_metadata\s*\.\s*(tenant_id|role|user_role|is_platform_owner)\s*=",
)


def strip_comments(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if "//" in line:
            line = line[: line.index("//")]
        lines.append(line)
    text = "\n".join(lines)
    while "/*" in text and "*/" in text:
        start = text.index("/*")
        end = text.index("*/", start) + 2
        text = text[:start] + "\n" + text[end:]
    return text


def is_strip_context(content: str, match_start: int) -> bool:
    window = content[max(0, match_start - 160) : match_start + 60]
    if "delete " in window and "user_metadata" in window:
        return True
    if "stripPrivilegedUserMetadata" in content:
        return True
    return False


def scan_file(path: Path) -> list[str]:
    if path in SKIP_FILES:
        return []

    raw = path.read_text(encoding="utf-8", errors="replace")
    content = strip_comments(raw)
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        rel = path.name
    violations: list[str] = []

    for m in USER_META_OBJECT.finditer(content):
        block = m.group(1)
        for key in PRIVILEGED_KEYS:
            if re.search(rf"\b{re.escape(key)}\s*:", block):
                if is_strip_context(content, m.start()):
                    continue
                violations.append(f"{rel}: user_metadata object contains '{key}'")

    for m in DIRECT_WRITE.finditer(content):
        key = m.group(1)
        if is_strip_context(content, m.start()):
            continue
        violations.append(f"{rel}: direct write user_metadata.{key} =")

    return violations


def main() -> int:
    violations: list[str] = []
    for scan_dir in SCAN_DIRS:
        if not scan_dir.exists():
            continue
        for path in sorted(scan_dir.rglob("*")):
            if path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
                continue
            if "node_modules" in path.parts:
                continue
            violations.extend(scan_file(path))

    if violations:
        print("FAIL: privileged auth claims must not be written to user_metadata:\n")
        for v in sorted(set(violations)):
            print(f"  - {v}")
        print(
            "\nUse app_metadata for tenant_id, role, user_role, is_platform_owner."
        )
        return 1

    print("OK: no user_metadata privileged claim writes detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
