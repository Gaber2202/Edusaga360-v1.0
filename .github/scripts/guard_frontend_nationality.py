#!/usr/bin/env python3
"""
guard_frontend_nationality.py

Fails CI if any frontend component recomputes Saudi nationality from the
`nationality` string. The canonical source of truth is the backend `is_saudi`
flag; the frontend must display it, never compare `nationality` to 'Saudi',
'saudi', 'سعودي' or 'سعود'.

Scans frontend/src and admin-portal/src.  Translation files are the only
allowed source of the literal strings, and only when not paired with a
nationality variable/field.
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCAN_DIRS = [ROOT / "frontend" / "src", ROOT / "admin-portal" / "src"]
SKIP_DIRS = {".git", "node_modules", "dist", "coverage", "build", ".devin-files"}
TEXT_SUFFIXES = {".js", ".jsx", ".ts", ".tsx"}

# Lines containing the word 'nationality' (property/variable) and a Saudi
# nationality string literal are almost always a client-side classification.
# Match the string as a whole word/token so 'is_saudi' and 'saudization' are not
# false positives.
SAUDI_WORD = re.compile(
    r"\b(?:Saudi|saudi|سعود|سعودي)\b",
    re.IGNORECASE,
)
NATIONALITY_TOKEN = re.compile(r"\bnationality\b")

# Allowlist: pure translation files may contain the strings without a
# nationality variable.  These are not classification logic.
ALLOWED_FILES = {
    "frontend/src/components/LanguageContext.jsx",
}


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def scan():
    violations = []
    for scan_dir in SCAN_DIRS:
        if not scan_dir.exists():
            continue
        for path in scan_dir.rglob("*"):
            if path.suffix not in TEXT_SUFFIXES:
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            rel = relative(path)
            if rel in ALLOWED_FILES:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except Exception:
                continue
            for line_no, line in enumerate(text.splitlines(), 1):
                if NATIONALITY_TOKEN.search(line) and SAUDI_WORD.search(line):
                    violations.append(f"  {rel}:{line_no}: {line.strip()}")
    return violations


def main():
    violations = scan()
    if violations:
        print("ERROR: frontend nationality classification found. Use is_saudi from the backend instead.")
        for v in violations:
            print(v)
        sys.exit(1)
    print("No frontend nationality classification found.")
    sys.exit(0)


if __name__ == "__main__":
    main()
