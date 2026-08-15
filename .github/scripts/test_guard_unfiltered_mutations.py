#!/usr/bin/env python3
"""
Unit test for guard_unfiltered_mutations.py.

Creates a temporary violation file, proves the guard fails, then adds an
allowlist comment and proves it passes.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "guard_unfiltered_mutations.py"


def run_guard(path: Path) -> tuple[int, str]:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--path", str(path)],
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout + result.stderr


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        violation = tmp_path / "Violation.jsx"
        violation.write_text(
            """
export async function badUpdate(invoice) {
  await tenantQuery('invoices').update({
    status: 'paid'
  });
}
"""
        )

        code, out = run_guard(tmp_path)
        if code == 0:
            print("FAIL: guard should have caught the unfiltered update")
            print(out)
            sys.exit(1)
        print("PASS: guard rejected deliberate violation")

        # Revert the deliberate violation.
        violation.unlink()

        allowed = tmp_path / "Allowed.jsx"
        allowed.write_text(
            """
// guard-allow-unfiltered: bulk archive operation is intentional
export async function bulkArchive(ids) {
  await tenantQuery('invoices').update({ status: 'archived' });
}
"""
        )

        code, out = run_guard(tmp_path)
        if code != 0:
            print("FAIL: guard should have allowed the commented site")
            print(out)
            sys.exit(1)
        print("PASS: guard accepted allowlisted site")

    print("All guard tests passed.")


if __name__ == "__main__":
    main()
