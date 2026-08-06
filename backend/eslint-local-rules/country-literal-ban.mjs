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

const FORBIDDEN_TERMS = [
  'ZATCA', 'Nafath', 'Moyasar', 'Nitaqat', 'GOSI', 'Qiwa', 'Mudad', 'Muqeem',
  'SADAD', "'SAR'", "'AED'", "'QAR'", 'Asia/Riyadh', 'halala',
]
  .map((t) => (t.startsWith("'") && t.endsWith("'") ? t.slice(1, -1) : t))
  .map((t) => t.toLowerCase());

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Map();
  try {
    const data = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
    const map = new Map();
    for (const entry of data) {
      const key = `${entry.file}::${entry.term}`;
      map.set(key, entry.count ?? 0);
    }
    return map;
  } catch {
    return new Map();
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
        },
      },
      create(context) {
        const allowlist = loadAllowlist();
        const filename = getRelative(context.filename);
        const source = context.sourceCode.getText();
        const seen = new Map();

        return {
          Program() {
            for (const term of FORBIDDEN_TERMS) {
              const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const re = new RegExp(escaped, 'gi');
              let match;
              while ((match = re.exec(source)) !== null) {
                const pos = match.index;
                const matchedTerm = match[0];
                const line = source.slice(0, pos).split('\n').length;
                const key = `${filename}::${matchedTerm.toLowerCase()}`;
                const allowed = allowlist.get(key) ?? 0;
                const count = (seen.get(key) ?? 0) + 1;
                seen.set(key, count);

                if (allowed === 0 && count === 1) {
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
