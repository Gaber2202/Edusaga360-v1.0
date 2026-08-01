/**
 * src/packs/sa/identity.ts
 *
 * Saudi identity validation (national ID / Iqama and IBAN).
 */

import type { IdentityService } from '../contract/CountryPack.js';

function validateNationalId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!/^\d{10}$/.test(trimmed)) return false;
  // Saudi national IDs start with 1; Iqama (residency) IDs start with 2.
  if (!/^1|^2/.test(trimmed)) return false;

  const digits = trimmed.split('').map(Number);
  // Luhn-variant checksum used by Saudi IDs (mod 11 with alternating 2/1 weights).
  const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2, 1];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const product = digits[i] * weights[i];
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

function validateIban(iban: string): boolean {
  if (!iban || typeof iban !== 'string') return false;
  const trimmed = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^SA\d{2}[A-Z0-9]{20}$/.test(trimmed)) return false;

  // ISO 13616 IBAN check: move first four chars to end, replace letters with digits.
  const rearranged = trimmed.slice(4) + trimmed.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55)))
    .join('');

  // Mod-97 by chunking to keep BigInt out of older Node targets.
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder === 1;
}

function formatNationalId(id: string): string {
  if (!validateNationalId(id)) return id;
  const trimmed = id.trim();
  return `${trimmed.slice(0, 2)} ${trimmed.slice(2, 5)} ${trimmed.slice(5, 8)} ${trimmed.slice(8, 10)}`;
}

export const saIdentity: IdentityService = {
  validateNationalId,
  validateIban,
  formatNationalId,
};
