#!/usr/bin/env python3
"""
guard_hardcoded_currency.py

Fails CI if any hardcoded currency code, symbol, or Saudi-specific currency word
appears in frontend/src, unless it is covered by the interim allowlist.

Matches:
  - ISO codes SAR / AED / QAR as whole words
  - Arabic currency symbols and words: ر.س, ريال, د.إ, درهم, ر.ق
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ALLOWLIST_PATH = Path('.github/allowed_hardcoded_currency.json')

# Whole-word ISO codes and Arabic currency strings.
CURRENCY_PATTERNS = {
    re.compile(r'\bSAR\b', re.IGNORECASE),
    re.compile(r'\bAED\b', re.IGNORECASE),
    re.compile(r'\bQAR\b', re.IGNORECASE),
    re.compile(r'ر\.س'),
    re.compile(r'ريال'),
    re.compile(r'د\.إ'),
    re.compile(r'درهم'),
    re.compile(r'ر\.ق'),
}

SKIP_DIRS = {
    '.git', 'node_modules', 'dist', 'coverage', 'build', '.devin-files',
    'secret_to_upload',
}

SKIP_FILES = {
    'allowed_hardcoded_currency.json',
    'guard_hardcoded_currency.py',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
}

TEXT_SUFFIXES = {'.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'}


def load_allowlist():
    if not ALLOWLIST_PATH.exists():
        return []
    with open(ALLOWLIST_PATH, 'r') as f:
        return json.load(f)


def save_allowlist(entries):
    ALLOWLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ALLOWLIST_PATH, 'w') as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
        f.write('\n')


def matches_for_line(line, file_path):
    """Return list of matched currency literals in a line."""
    found = []
    for pat in CURRENCY_PATTERNS:
        for m in pat.finditer(line):
            # Skip matches inside comments? Keep simple; allowlist handles legitimate.
            found.append(m.group(0))
    return found


def scan():
    hits = defaultdict(lambda: defaultdict(int))
    for root, dirs, files in os.walk('frontend/src'):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            if fname in SKIP_FILES:
                continue
            ext = Path(fname).suffix
            if ext not in TEXT_SUFFIXES:
                continue
            path = Path(root) / fname
            try:
                text = path.read_text(encoding='utf-8')
            except UnicodeDecodeError:
                continue
            for lineno, line in enumerate(text.splitlines(), 1):
                # Quick heuristic: skip import paths and variable names that contain SAR?
                # We rely on allowlist.
                for lit in matches_for_line(line, path):
                    hits[str(path)][lit.lower()] += 1
    return hits


def main():
    parser = argparse.ArgumentParser(description='Hardcoded currency literal guard')
    parser.add_argument('--update-baseline', action='store_true', help='Regenerate allowlist from current code')
    args = parser.parse_args()

    hits = scan()
    allowlist = load_allowlist()
    allow_by_file_term = {(e['file'], e['term']): e for e in allowlist}

    if args.update_baseline:
        new_entries = []
        for file_path, terms in hits.items():
            for term, count in terms.items():
                key = (file_path, term)
                expiry = allow_by_file_term.get(key, {}).get('expires', '2026-12-31')
                new_entries.append({'file': file_path, 'term': term, 'count': count, 'expires': expiry})
        new_entries.sort(key=lambda e: (e['file'], e['term']))
        save_allowlist(new_entries)
        total = sum(e['count'] for e in new_entries)
        print(f'Updated allowlist: {len(new_entries)} entries, {total} total occurrences.')
        return 0

    unallowed = []
    for file_path, terms in hits.items():
        for term, count in terms.items():
            key = (file_path, term)
            allowed = allow_by_file_term.get(key)
            if allowed:
                # If actual count exceeds allowed count, the excess is unallowed.
                allowed_count = allowed.get('count', 0)
                if count > allowed_count:
                    unallowed.append((file_path, term, count - allowed_count))
            else:
                unallowed.append((file_path, term, count))

    if unallowed:
        print('Unallowed hardcoded currency literals:')
        for file_path, term, count in sorted(unallowed):
            print(f'  {file_path}: {term} ({count})')
        return 1

    total = sum(e['count'] for e in allowlist)
    print(f'No unallowed hardcoded currency literals. Allowlist: {len(allowlist)} entries, {total} total.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
