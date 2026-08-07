/**
 * src/packs/sa/nationality.ts
 *
 * Single source of truth for deciding whether a value represents a Saudi
 * nationality. Used by payroll (GOSI) and regulator reports (Nitaqat) so both
 * subsystems give the same answer for the same input.
 */

type NationalityInput =
  | string
  | null
  | undefined
  | { is_saudi?: boolean | null; nationality?: string | null };

export function isSaudi(input: NationalityInput): boolean {
  if (typeof input === 'string') {
    const n = input.toLowerCase().trim();
    return n === 'saudi' || n === 'saudi arabia' || n === 'sa' || n === 'سعودي';
  }

  if (input && typeof input === 'object') {
    if (input.is_saudi === true) return true;
    return isSaudi(input.nationality);
  }

  return false;
}
