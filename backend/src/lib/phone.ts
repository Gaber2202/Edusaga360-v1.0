/**
 * Normalize a phone number for Infobip/WhatsApp/SMS APIs.
 * - Strips all non-digit characters.
 * - Collapses leading `00` to nothing.
 * - If the number still starts with `0` (local format), prepends the default
 *   country code (966 for KSA by default).
 * - Does NOT modify numbers that already begin with a country code.
 */
export function normalizePhone(raw: string, defaultCountryCode = '966'): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) {
    digits = (defaultCountryCode || '') + digits.slice(1);
  }
  return digits;
}
