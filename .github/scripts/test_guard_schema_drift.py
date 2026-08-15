#!/usr/bin/env python3
"""
Fixture tests for guard_schema_drift.py.
Creates temporary frontend source files, runs the guard, and asserts it fails
on deliberate violations and passes after they are removed.
"""

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FRONTEND = REPO / "frontend" / "src"
GUARD = REPO / ".github" / "scripts" / "guard_schema_drift.py"
FIXTURE_DIR = FRONTEND / "__tests__" / "schema_drift_guard_fixture"


def run_guard():
    return subprocess.run([sys.executable, str(GUARD)], cwd=REPO, capture_output=True, text=True)


def cleanup():
    if FIXTURE_DIR.exists():
        for p in FIXTURE_DIR.iterdir():
            p.unlink()
        FIXTURE_DIR.rmdir()
        FIXTURE_DIR.parent.rmdir() if FIXTURE_DIR.parent.exists() and not any(FIXTURE_DIR.parent.iterdir()) else None


def main():
    cleanup()
    try:
        FIXTURE_DIR.mkdir(parents=True, exist_ok=False)

        # Pass baseline first
        result = run_guard()
        assert result.returncode == 0, f"Guard should pass on clean tree:\n{result.stdout}\n{result.stderr}"

        # Deliberate violation: unknown table + no-arg .order()
        bad_file = FIXTURE_DIR / "BadComponent.jsx"
        bad_file.write_text(
            "import { tenantQuery } from '../../lib/tenantQuery';\n"
            "export const bad = () => tenantQuery('phantom_xyz_table').select('*').order();\n",
            encoding="utf-8",
        )
        result = run_guard()
        assert result.returncode == 1, f"Guard should fail on deliberate violation:\n{result.stdout}\n{result.stderr}"
        assert "phantom_xyz_table" in result.stdout, f"Violation output should name the bad table:\n{result.stdout}"

        # Fix the table name and add an order column; guard should pass again
        bad_file.write_text(
            "import { tenantQuery } from '../../lib/tenantQuery';\n"
            "export const ok = () => tenantQuery('invoices').select('*').order('created_at', { ascending: false });\n",
            encoding="utf-8",
        )
        result = run_guard()
        assert result.returncode == 0, f"Guard should pass after fixing violation:\n{result.stdout}\n{result.stderr}"

        print("Schema drift guard fixture tests passed.")
        return 0
    finally:
        cleanup()


if __name__ == "__main__":
    sys.exit(main())
