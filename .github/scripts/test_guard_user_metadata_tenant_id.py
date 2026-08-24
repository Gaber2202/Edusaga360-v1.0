#!/usr/bin/env python3
"""Fixture tests for guard_user_metadata_tenant_id.py."""

import importlib.util
import sys
import tempfile
from pathlib import Path

_GUARD_PATH = Path(__file__).resolve().parent / "guard_user_metadata_tenant_id.py"
_spec = importlib.util.spec_from_file_location("guard_user_metadata_tenant_id", _GUARD_PATH)
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)


def write_fixture(content: str) -> Path:
    with tempfile.NamedTemporaryFile("w", suffix=".ts", delete=False) as f:
        f.write(content)
        return Path(f.name)


MUST_CATCH = [
    ("tenant_id in user_metadata object", """
      await supabase.auth.admin.createUser({
        email: 'x@y.com',
        user_metadata: { tenant_id: 'abc', full_name: 'X' },
      });
    """),
    ("role in user_metadata object", """
      await supabase.auth.admin.updateUserById(id, {
        user_metadata: { role: 'admin' },
      });
    """),
    ("is_platform_owner in user_metadata", """
      const payload = { user_metadata: { is_platform_owner: true } };
    """),
]

MUST_ALLOW = [
    ("app_metadata tenant_id", """
      await supabase.auth.admin.createUser({
        app_metadata: { tenant_id: 'abc', role: 'admin' },
        user_metadata: { full_name: 'X' },
      });
    """),
    ("delete tenant_id from user_metadata", """
      delete (cleanedUserMetadata as Record<string, unknown>).tenant_id;
      await supabase.auth.admin.updateUserById(id, { user_metadata: cleanedUserMetadata });
    """),
    ("comment only", """
      // user_metadata must not contain tenant_id
      const x = 1;
    """),
]


def run() -> None:
    errors = []

    for desc, code in MUST_CATCH:
        path = write_fixture(code)
        hits = guard.scan_file(path)
        path.unlink(missing_ok=True)
        if not hits:
            errors.append(f"Expected violation not caught: {desc}")

    for desc, code in MUST_ALLOW:
        path = write_fixture(code)
        hits = guard.scan_file(path)
        path.unlink(missing_ok=True)
        if hits:
            errors.append(f"False positive for: {desc} -> {hits}")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    print(f"OK: {len(MUST_CATCH)} catch + {len(MUST_ALLOW)} allow fixtures passed")


if __name__ == "__main__":
    run()
