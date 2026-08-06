/**
 * ESLint rule: country-literal-ban
 *
 * Flags Saudi/GCC-specific literals outside the jurisdiction packs. The same
 * allowlist file is used by .github/scripts/guard_country_literals.py so the
 * ripgrep and ESLint checks stay in sync.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const RULE_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(RULE_DIR, '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, '.github', 'allowed_country_literals.json');

const NAMED_TERMS = [
  'ZATCA', 'Nafath', 'Moyasar', 'Nitaqat', 'GOSI', 'Qiwa', 'Mudad', 'Muqeem',
  'SADAD', 'Asia/Riyadh', 'halala',
];
const CURRENCY_TERMS = ['SAR', 'AED', 'QAR'];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTermPattern(term) {
  if (CURRENCY_TERMS.includes(term)) {
    // Standalone token, not part of an identifier or hyphenated word,
    // and not followed immediately by '(' (function call).
    return new RegExp(
      `(?<![A-Za-z0-9_-])${escapeRegExp(term)}(?![A-Za-z0-9_-])(?![(])`,
      'gi',
    );
  }
  return new RegExp(escapeRegExp(term), 'gi');
}

const TERM_PATTERNS = Object.fromEntries(
  [...NAMED_TERMS, ...CURRENCY_TERMS].map((t) => [t.toLowerCase(), buildTermPattern(t)]),
);

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Map();
  try {
    const data = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    const map = new Map();
    for (const entry of data) {
      const key = `${entry.file}::${entry.term}`;
      map.set(key, { count: entry.count ?? 0, expires: entry.expires });
    }
    return map;
  } catch {
    return new Map();
  }
}

function isExpired(expires) {
  if (!expires) return false;
  try {
    return new Date(expires) < new Date(new Date().toDateString());
  } catch {
    return false;
  }
}

function getRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/');
}

export default {
  rules: {
    'country-literal-ban': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow Saudi/GCC-specific literals outside country packs.',
        },
        schema: [],
        messages: {
          disallowedLiteral: "Country-specific literal '{{term}}' is not allowed in {{file}}. Move it into a pack or add to the allowlist with an expiry.",
          countExceeded: "Country-specific literal '{{term}}' occurs {{actual}} times in {{file}}, allowlist count is {{allowed}}.",
          expired: "Allowlist entry for '{{term}}' in {{file}} expired on {{expires}}. Remove the literal or extend the expiry deliberately.",
        },
      },
      create(context) {
        const allowlist = loadAllowlist();
        const filename = getRelative(context.filename);
        const source = context.sourceCode.getText();
        const seen = new Map();

        return {
          Program() {
            for (const [term, pattern] of Object.entries(TERM_PATTERNS)) {
              let match;
              while ((match = pattern.exec(source)) !== null) {
                const pos = match.index;
                const matchedTerm = match[0];
                const line = source.slice(0, pos).split('\n').length;
                const key = `${filename}::${matchedTerm.toLowerCase()}`;
                const entry = allowlist.get(key) ?? { count: 0 };
                const allowed = entry.count ?? 0;
                const count = (seen.get(key) ?? 0) + 1;
                seen.set(key, count);

                if (isExpired(entry.expires) && count === 1) {
                  context.report({
                    loc: { start: { line, column: 0 }, end: { line, column: 0 } },
                    messageId: 'expired',
                    data: { term: matchedTerm, file: filename, expires: entry.expires },
                  });
                } else if (allowed === 0 && count === 1) {
                  context.report({
                    loc: { start: { line, column: 0 }, end: { line, column: 0 } },
                    messageId: 'disallowedLiteral',
                    data: { term: matchedTerm, file: filename },
                  });
                } else if (count > allowed && allowed > 0) {
                  context.report({
                    loc: { start: { line, column: 0 }, end: { line, column: 0 } },
                    messageId: 'countExceeded',
                    data: { term: matchedTerm, file: filename, actual: count, allowed },
                  });
                }
              }
            }
          },
        };
      },
    },
  },
};
