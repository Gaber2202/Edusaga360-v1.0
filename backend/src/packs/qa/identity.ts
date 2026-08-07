/**
 * src/packs/qa/identity.ts
 *
 * Qatar identity validation: Qatari ID (QID) and Qatar IBAN. Tawtheeq integration
 * is a stub because OAuth/SAML onboarding is case-by-case.
 */

import type { IdentityService } from '../contract/CountryPack.js';

function validateNationalId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  // Qatari QID numbers are 11 digits.
  return /^\d{11}$/.test(trimmed);
}

function formatNationalId(id: string): string {
  if (!validateNationalId(id)) return id;
  const trimmed = id.trim();
  // Common display grouping: 123 4567 8901
  return `${trimmed.slice(0, 3)} ${trimmed.slice(3, 7)} ${trimmed.slice(7, 11)}`;
}

function validateIban(iban: string): boolean {
  if (!iban || typeof iban !== 'string') return false;
  const trimmed = iban.replace(/\s+/g, '').toUpperCase();
  // Qatar IBAN is 29 characters: QA + 2 check digits + 4 bank letters + 21 account alphanumeric.
  if (!/^QA\d{2}[A-Z]{4}[A-Z0-9]{21}$/.test(trimmed)) return false;

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

export const qaIdentity: IdentityService = {
  validateNationalId,
  validateIban,
  formatNationalId,
};
