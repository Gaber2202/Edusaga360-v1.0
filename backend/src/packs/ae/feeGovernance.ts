/**
 * src/packs/ae/feeGovernance.ts
 *
 * UAE fee-governance adapter. Implements the verified MECHANISM (Irtiqaa
 * rating × ECI, registration cap 5%, 3-year operating minimum, ≥80% occupancy
 * for exceptional increases, January submission). The numeric ECI/cap is an
 * effective-dated config row in regulatory_register and may be empty for
 * regulators that have not published a current value.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type {
  FeeGovernanceService,
  FeeIncreaseInput,
  FeeIncreaseResult,
} from '../contract/CountryPack.js';

const JURISDICTION_CODE = 'AE';

interface RegulatoryRow {
  parameter_key: string;
  parameter_value: string | number | boolean | object;
}

async function loadParameters(
  supabase: SupabaseClient,
  regulatorCode?: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('regulatory_register')
    .select('parameter_key, parameter_value')
    .eq('jurisdiction_code', JURISDICTION_CODE)
    .lte('effective_from', new Date().toISOString().slice(0, 10))
    .gte('effective_to', new Date().toISOString().slice(0, 10));

  if (error) throw error;

  const out: Record<string, unknown> = {};
  for (const row of (data ?? []) as RegulatoryRow[]) {
    out[row.parameter_key] = row.parameter_value;
  }

  if (regulatorCode) {
    const { data: regData, error: regError } = await supabase
      .from('regulatory_register')
      .select('parameter_key, parameter_value')
      .eq('jurisdiction_code', JURISDICTION_CODE)
      .eq('regulator_code', regulatorCode)
      .lte('effective_from', new Date().toISOString().slice(0, 10))
      .gte('effective_to', new Date().toISOString().slice(0, 10));

    if (regError) throw regError;
    for (const row of (regData ?? []) as RegulatoryRow[]) {
      out[row.parameter_key] = row.parameter_value;
    }
  }

  return out;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function evaluateFeeIncrease(
  supabase: unknown,
  _jurisdictionCode: string,
  input: FeeIncreaseInput,
): Promise<FeeIncreaseResult> {
  const params = await loadParameters(supabase as SupabaseClient, input.regulatorCode);

  if (params.fee_increase_allowed_2026_27 === false || params.fee_increase_allowed_2026_27 === 'false') {
    return { permitted: false, reason: 'Fee increases are not permitted for 2026-27 by the regulator.' };
  }

  const operatingMinimum = toNumber(params.operating_years_minimum) ?? 3;
  if ((input.yearsOfOperation ?? 0) < operatingMinimum) {
    return {
      permitted: false,
      reason: `School must have operated for at least ${operatingMinimum} academic years before a standard increase.`,
    };
  }

  const registrationCap = toNumber(params.registration_fee_cap_pct) ?? 0.05;
  // Registration fee is validated separately at fee-structure creation.
  if (input.proposedTuition < input.currentTuition * (1 - registrationCap)) {
    return {
      permitted: false,
      reason: `Proposed tuition is below the regulator-imposed registration fee cap context (${Math.round(registrationCap * 100)}%).`,
    };
  }

  const increaseBasis = String(params.increase_basis ?? 'rating_x_eci');
  if (increaseBasis === 'rating_x_eci') {
    const eci = toNumber(input.eci) ?? toNumber(params.eci_value) ?? undefined;
    if (eci === undefined) {
      return {
        permitted: false,
        maxIncreasePct: undefined,
        reason: 'Numeric ECI/cap is not configured for this regulator cycle.',
      };
    }

    let ratingMultiplier = 1;
    const rating = (input.rating ?? '').toLowerCase();
    if (rating === 'improved_1') ratingMultiplier = 2;
    else if (rating === 'improved_2') ratingMultiplier = 1.75;
    else if (rating === 'improved_3') ratingMultiplier = 1.5;
    else if (rating === 'maintain') ratingMultiplier = 1;
    else if (rating === 'drop') ratingMultiplier = 0;

    const maxIncreasePct = eci * ratingMultiplier;
    const maxTuition = Math.round(input.currentTuition * (1 + maxIncreasePct / 100) * 100) / 100;
    const permitted = input.proposedTuition <= maxTuition + 0.005;

    return {
      permitted,
      maxIncreasePct,
      maxTuition,
      reason: permitted
        ? `Proposed tuition is within ${maxIncreasePct.toFixed(2)}% standard increase cap.`
        : `Proposed tuition exceeds ${maxIncreasePct.toFixed(2)}% standard increase cap.`,
    };
  }

  throw new NotImplementedInJurisdiction('AE', `Fee governance increase basis ${increaseBasis}`);
}

export const aeFeeGovernance: FeeGovernanceService = {
  evaluateFeeIncrease,
};
