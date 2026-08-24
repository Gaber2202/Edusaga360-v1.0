/**
 * Map registration country strings to jurisdiction codes.
 * Used by the registration approval flow — jurisdiction is set at tenant
 * creation from the school's selected country, not from IP or browser locale.
 */
export const COUNTRY_TO_JURISDICTION: Record<string, string> = {
  SA: 'SA',
  'SAUDI ARABIA': 'SA',
  AE: 'AE',
  'UNITED ARAB EMIRATES': 'AE',
  QA: 'QA',
  QATAR: 'QA',
};

/** Resolve a registration country value to a jurisdiction code, or undefined if unknown. */
export function countryToJurisdiction(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  return COUNTRY_TO_JURISDICTION[country.trim().toUpperCase()];
}
