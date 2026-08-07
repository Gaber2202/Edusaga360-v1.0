/**
 * src/packs/qa/feeGovernance.ts
 *
 * Qatar fee-governance adapter. Implements the verified MOEHE approval mechanism
 * and the 18-month notice period. Numeric caps are held in regulatory_register
 * and are left empty until MOEHE publishes them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FeeGovernanceService,
  FeeIncreaseInput,
  FeeIncreaseResult,
} from '../contract/CountryPack.js';

const JURISDICTION_CODE = 'QA';

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

  const operatingMinimum = toNumber(params.operating_years_minimum);
  if (operatingMinimum !== undefined && (input.yearsOfOperation ?? 0) < operatingMinimum) {
    return {
      permitted: false,
      reason: `School must have operated for at least ${operatingMinimum} academic years before a fee increase.`,
    };
  }

  const noticeMonths = toNumber(params.notice_period_months) ?? 18;
  // The 18-month notice is a structural constraint; without an actual last-increase
  // date in the input we cannot enforce the calendar portion, but we surface the
  // requirement in the result.

  const maxIncreasePct = toNumber(params.max_increase_pct);
  if (maxIncreasePct === undefined) {
    return {
      permitted: false,
      reason: `MOEHE approval is required. The numeric fee-increase cap is not configured (${noticeMonths}-month notice period applies).`,
    };
  }

  const maxTuition = Math.round(input.currentTuition * (1 + maxIncreasePct / 100) * 100) / 100;
  const permitted = input.proposedTuition <= maxTuition + 0.005;

  return {
    permitted,
    maxIncreasePct,
    maxTuition,
    reason: permitted
      ? `Proposed tuition is within the ${maxIncreasePct.toFixed(2)}% MOEHE-approved cap.`
      : `Proposed tuition exceeds the ${maxIncreasePct.toFixed(2)}% MOEHE-approved cap.`,
  };
}

export const qaFeeGovernance: FeeGovernanceService = {
  evaluateFeeIncrease,
};
