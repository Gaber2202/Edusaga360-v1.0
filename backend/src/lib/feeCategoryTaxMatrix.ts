/**
 * P1-E — Fee-category → tax treatment matrix (SA / AE / QA).
 *
 * ADR-002: unresolved category throws with a named cause.
 * KSA national-student VAT remains configurable (founder decision #5) —
 * do not hardcode a commercial position here.
 */

export type VatTreatment = 'standard' | 'zero_rated' | 'exempt' | 'out_of_scope';

/** Canonical fee category codes used across packs. */
export type FeeCategoryCode =
  | 'TUITION'
  | 'UNIFORM'
  | 'FOOD'
  | 'CANTEEN'
  | 'DEVICES'
  | 'TRANSPORT'
  | 'REGISTRATION'
  | 'OTHER';

/**
 * Handover §1.6 matrix (published guidance as of Aug 2026 — confirm with adviser
 * before commercial reliance).
 *
 * QA: 0% because there is no VAT regime yet — reason is explicit (out_of_scope),
 * not a silent "standard at 0%".
 */
const MATRIX: Record<string, Record<string, VatTreatment>> = {
  SA: {
    TUITION: 'standard', // national-student exemption TBD — founder decision #5
    UNIFORM: 'standard',
    FOOD: 'standard',
    CANTEEN: 'standard',
    DEVICES: 'standard',
    TRANSPORT: 'standard',
    REGISTRATION: 'standard',
    OTHER: 'standard',
  },
  AE: {
    TUITION: 'zero_rated',
    UNIFORM: 'standard',
    FOOD: 'standard',
    CANTEEN: 'standard',
    DEVICES: 'standard',
    TRANSPORT: 'exempt',
    REGISTRATION: 'zero_rated',
    OTHER: 'standard',
  },
  QA: {
    TUITION: 'out_of_scope',
    UNIFORM: 'out_of_scope',
    FOOD: 'out_of_scope',
    CANTEEN: 'out_of_scope',
    DEVICES: 'out_of_scope',
    TRANSPORT: 'out_of_scope',
    REGISTRATION: 'out_of_scope',
    OTHER: 'out_of_scope',
  },
};

const CODE_ALIASES: Record<string, FeeCategoryCode> = {
  TUITION: 'TUITION',
  FEE_TUITION: 'TUITION',
  TUI: 'TUITION',
  UNIFORM: 'UNIFORM',
  UNI: 'UNIFORM',
  FOOD: 'FOOD',
  MEALS: 'FOOD',
  CANTEEN: 'CANTEEN',
  DEVICES: 'DEVICES',
  DEVICE: 'DEVICES',
  TRANSPORT: 'TRANSPORT',
  BUS: 'TRANSPORT',
  REGISTRATION: 'REGISTRATION',
  BOOKS: 'OTHER',
  BK: 'OTHER',
  ACTIVITIES: 'OTHER',
  TRIP: 'OTHER',
  LATE_FEE: 'OTHER',
  OTHER: 'OTHER',
  FEE: 'OTHER',
  MANUAL: 'OTHER',
};

export function normalizeFeeCategoryCode(code: string | null | undefined): FeeCategoryCode | null {
  if (!code) return null;
  const key = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return CODE_ALIASES[key] ?? null;
}

export function resolveFeeCategoryTaxTreatment(
  jurisdictionCode: string,
  categoryCode: string | null | undefined,
): VatTreatment {
  const jur = (jurisdictionCode || '').toUpperCase();
  const matrix = MATRIX[jur];
  if (!matrix) {
    throw new Error(`tax_treatment_unresolved: no fee-category matrix for jurisdiction ${jur || '(empty)'}`);
  }
  const normalized = normalizeFeeCategoryCode(categoryCode);
  if (!normalized) {
    throw new Error(
      `tax_treatment_unresolved: fee category code ${JSON.stringify(categoryCode)} is not mapped for ${jur}`,
    );
  }
  const treatment = matrix[normalized];
  if (!treatment) {
    throw new Error(
      `tax_treatment_unresolved: no treatment for category ${normalized} in jurisdiction ${jur}`,
    );
  }
  return treatment;
}

/**
 * Activation gate (ADR-002): every fee category in use at a branch must have a
 * matrix entry. Throws naming the first failing category code.
 */
export function assertFeeCategoriesHaveTaxTreatment(
  jurisdictionCode: string,
  categoryCodes: Array<string | null | undefined>,
): void {
  const seen = new Set<string>();
  for (const code of categoryCodes) {
    const key = (code ?? '').toUpperCase() || '(missing)';
    if (seen.has(key)) continue;
    seen.add(key);
    resolveFeeCategoryTaxTreatment(jurisdictionCode, code);
  }
}

export function listMatrixForJurisdiction(jurisdictionCode: string): Record<string, VatTreatment> {
  const jur = jurisdictionCode.toUpperCase();
  const matrix = MATRIX[jur];
  if (!matrix) {
    throw new Error(`tax_treatment_unresolved: no fee-category matrix for jurisdiction ${jur}`);
  }
  return { ...matrix };
}
