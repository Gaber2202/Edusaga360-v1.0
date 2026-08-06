/**
 * src/packs/ae/identity.ts
 *
 * UAE identity validation: Emirates ID and IBAN. UAE Pass integration is a
 * stub because onboarding is case-by-case.
 */

import type { IdentityService } from '../contract/CountryPack.js';

function validateNationalId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  // Emirates ID / UAE residency numbers are 15 digits.
  return /^\d{15}$/.test(trimmed);
}

function formatNationalId(id: string): string {
  if (!validateNationalId(id)) return id;
  const trimmed = id.trim();
  return `${trimmed.slice(0, 4)} ${trimmed.slice(4, 7)} ${trimmed.slice(7, 14)} ${trimmed.slice(14, 15)}`;
}

function validateIban(iban: string): boolean {
  if (!iban || typeof iban !== 'string') return false;
  const trimmed = iban.replace(/\s+/g, '').toUpperCase();
  // UAE IBAN is 23 characters: AE + 21 digits.
  if (!/^AE\d{21}$/.test(trimmed)) return false;

  const rearranged = trimmed.slice(4) + trimmed.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55)))
    .join('');

  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder === 1;
}

export const aeIdentity: IdentityService = {
  validateNationalId,
  validateIban,
  formatNationalId,
};
