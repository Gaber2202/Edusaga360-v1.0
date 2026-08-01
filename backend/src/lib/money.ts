import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_MINOR_UNITS = 2;
const minorUnitsCache = new Map<string, number>();

function toNumber(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Read minor_units from the currencies table, falling back to 2 when the row
 * is missing or the query fails. Results are cached per process.
 */
export async function getMinorUnits(
  supabase: SupabaseClient,
  currencyCode?: string | null,
): Promise<number> {
  if (!currencyCode) return DEFAULT_MINOR_UNITS;
  const cached = minorUnitsCache.get(currencyCode);
  if (cached !== undefined) return cached;
  try {
    const { data, error } = await supabase
      .from('currencies')
      .select('minor_units')
      .eq('code', currencyCode)
      .maybeSingle();
    if (error) throw error;
    const units = (data?.minor_units as number | undefined) ?? DEFAULT_MINOR_UNITS;
    minorUnitsCache.set(currencyCode, units);
    return units;
  } catch {
    return DEFAULT_MINOR_UNITS;
  }
}

/** Convert a major-unit amount to the currency's minor-unit integer. */
export function toMinorUnits(
  amount: number | string | null | undefined,
  minorUnits: number,
): number {
  const num = toNumber(amount);
  const factor = 10 ** minorUnits;
  return Math.round(num * factor);
}

/** Convert a minor-unit integer to the currency's major-unit amount. */
export function toMajorUnits(
  amount: number | string | null | undefined,
  minorUnits: number,
): number {
  const num = toNumber(amount);
  const factor = 10 ** minorUnits;
  return Math.round(num) / factor;
}

/** Round a major-unit amount to the currency's minor-unit precision. */
export function roundToMinorUnits(
  amount: number | string | null | undefined,
  minorUnits: number,
): number {
  const num = toNumber(amount);
  const factor = 10 ** minorUnits;
  return Math.round(num * factor) / factor;
}

/** SAR-only rounding helper (SAR uses 2 minor units). Prefer roundToMinorUnits for new code. */
export function sar(num: number): number {
  return roundToMinorUnits(num, 2);
}
