/**
 * src/lib/payroll.ts
 *
 * Generic payroll calculations used by multiple country packs. Each pack
 * supplies its own jurisdiction-specific rules and currency code; the helpers
 * below encode only the shared arithmetic.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRamadan } from './hijri.js';
import { NotImplementedInJurisdiction } from './jurisdiction.js';
import { roundToMinorUnits } from './money.js';

export interface GratuityTier {
  /** Number of years this tier applies to. Use Infinity for the final/open tier. */
  years: number;
  /** Days of pay per year in this tier. */
  daysPerYear: number;
}

export interface GratuityRules {
  currencyCode: string;
  tiers: GratuityTier[];
  /** Maximum years of wage to cap the gratuity at. Undefined means no cap. */
  capYears?: number;
  /** Lowercase nationality strings that are exempt from foreign-worker gratuity. */
  nationalityExemptions?: string[];
  /**
   * Optional resignation payout factors by completed years of service (SCRUM-122 / SA Art. 85).
   * Applied after unpaid-leave adjustment. Termination / end_of_contract = factor 1.
   */
  resignationFactors?: Array<{ maxYears: number; factor: number }>;
}

export type EosExitType = 'resignation' | 'termination' | 'end_of_contract';

export interface EosOptions {
  /** v1 locked: resignation. Other types pay full computed gratuity (no resignation factor). */
  exitType?: EosExitType;
  /** Unpaid leave days reduce qualifying service (days/365). No notice-period deductions in v1. */
  unpaidLeaveDays?: number;
}

function tierRateAt(tiers: GratuityTier[], yearsOfService: number): number {
  let lower = 0;
  for (const tier of tiers) {
    const upper = tier.years === Infinity ? Infinity : lower + tier.years;
    if (yearsOfService >= lower && yearsOfService < upper) {
      return tier.daysPerYear;
    }
    lower = upper;
  }
  return tiers[tiers.length - 1]?.daysPerYear ?? 0;
}

/** Subtract unpaid leave from tenure before gratuity tiers. */
export function adjustServiceYearsForUnpaidLeave(
  yearsOfService: number,
  unpaidLeaveDays = 0,
): number {
  const days = Math.max(0, Number(unpaidLeaveDays) || 0);
  return Math.max(0, yearsOfService - days / 365);
}

function resignationFactor(years: number, factors?: Array<{ maxYears: number; factor: number }>): number {
  if (!factors?.length) return 1;
  for (const row of factors) {
    if (years < row.maxYears || !Number.isFinite(row.maxYears)) return row.factor;
  }
  return factors[factors.length - 1]?.factor ?? 1;
}

export function calculateEndOfServiceBenefit(
  basicSalary: number,
  yearsOfService: number,
  nationality: string | undefined,
  rules: GratuityRules,
  options?: EosOptions,
): { amount: number; currencyCode: string; qualifying_years: number; unpaid_leave_days: number; exit_type: EosExitType } {
  const exitType: EosExitType = options?.exitType ?? 'resignation';
  const unpaidLeaveDays = Math.max(0, Number(options?.unpaidLeaveDays) || 0);
  const qualifyingYears = adjustServiceYearsForUnpaidLeave(yearsOfService, unpaidLeaveDays);

  const exempt = (rules.nationalityExemptions ?? []).map((n) => n.toLowerCase());
  if (nationality && exempt.includes(nationality.toLowerCase().trim())) {
    return {
      amount: 0,
      currencyCode: rules.currencyCode,
      qualifying_years: qualifyingYears,
      unpaid_leave_days: unpaidLeaveDays,
      exit_type: exitType,
    };
  }

  const wholeYears = Math.floor(qualifyingYears);
  const fraction = qualifyingYears - wholeYears;

  let days = 0;
  let consumed = 0;
  for (const tier of rules.tiers) {
    const span =
      tier.years === Infinity
        ? Math.max(0, wholeYears - consumed)
        : Math.max(0, Math.min(tier.years, wholeYears - consumed));
    days += span * tier.daysPerYear;
    consumed += span;
  }

  if (fraction > 0 && qualifyingYears >= 1) {
    days += fraction * tierRateAt(rules.tiers, wholeYears);
  }

  if (rules.capYears !== undefined) {
    const maxDays = rules.capYears * 365;
    days = Math.min(days, maxDays);
  }

  const annualWage = basicSalary * 12;
  const dailyWage = annualWage / 365;
  let amount = roundToMinorUnits(dailyWage * days, 2);

  // v1: only resignation applies jurisdiction resignation factors; no notice deductions.
  if (exitType === 'resignation') {
    const factor = resignationFactor(qualifyingYears, rules.resignationFactors);
    amount = roundToMinorUnits(amount * factor, 2);
  }

  return {
    amount,
    currencyCode: rules.currencyCode,
    qualifying_years: roundToMinorUnits(qualifyingYears, 4),
    unpaid_leave_days: unpaidLeaveDays,
    exit_type: exitType,
  };
}

export interface OvertimeRules {
  currencyCode: string;
  jurisdictionCode: string;
  /** If true, rest-day overtime is calculated; otherwise it throws. */
  allowRestDay: boolean;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object' && !(value instanceof Date)) {
    if (Array.isArray(value)) return undefined;
    if (Object.keys(value as object).length === 0) return undefined;
  }
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function loadRegulatoryValue(
  supabase: unknown,
  jurisdictionCode: string,
  parameterKey: string,
  asOf?: Date | string,
): Promise<unknown | undefined> {
  const target = asOf
    ? typeof asOf === 'string'
      ? asOf.slice(0, 10)
      : asOf.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const { data, error } = await (supabase as SupabaseClient)
    .from('regulatory_register')
    .select('parameter_value')
    .eq('jurisdiction_code', jurisdictionCode)
    .eq('parameter_key', parameterKey)
    .lte('effective_from', target)
    .gte('effective_to', target)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return data.parameter_value;
}

export async function calculateOvertime(
  basicSalary: number,
  normalHoursPerMonth: number,
  overtimeHours: number,
  rules: OvertimeRules,
  options?: {
    isNight?: boolean;
    isRestDay?: boolean;
    date?: Date | string;
    supabase?: unknown;
  },
): Promise<{ amount: number; currencyCode: string }> {
  if (normalHoursPerMonth <= 0 || overtimeHours <= 0) {
    return { amount: 0, currencyCode: rules.currencyCode };
  }

  const { isNight = false, isRestDay = false, date, supabase } = options ?? {};

  if (isRestDay && !rules.allowRestDay) {
    throw new NotImplementedInJurisdiction(
      rules.jurisdictionCode,
      'PayrollService.calculateOvertime — rest-day overtime premium is not implemented for this jurisdiction',
    );
  }

  if (!supabase) {
    throw new NotImplementedInJurisdiction(
      rules.jurisdictionCode,
      'PayrollService.calculateOvertime — effective-dated regulatory parameters are required',
    );
  }

  const dailyHoursValue = await loadRegulatoryValue(supabase, rules.jurisdictionCode, 'working_hours_per_day');
  const dailyHours = toOptionalNumber(dailyHoursValue);
  if (dailyHours === undefined || dailyHours <= 0) {
    throw new NotImplementedInJurisdiction(
      rules.jurisdictionCode,
      'PayrollService.calculateOvertime — working_hours_per_day is not configured',
    );
  }

  let adjustedHours = normalHoursPerMonth;

  if (date && isRamadan(date)) {
    const reductionValue = await loadRegulatoryValue(
      supabase,
      rules.jurisdictionCode,
      'ramadan_working_hours_reduction',
      date,
    );
    const reduction = toOptionalNumber(reductionValue);
    if (reduction === undefined) {
      throw new NotImplementedInJurisdiction(
        rules.jurisdictionCode,
        'PayrollService.calculateOvertime — ramadan_working_hours_reduction is not configured',
      );
    }
    const workingDays = normalHoursPerMonth / dailyHours;
    if (workingDays > 0) {
      adjustedHours = roundToMinorUnits(workingDays * (dailyHours - reduction), 2);
    }
  }

  let premiumValue: unknown;
  if (isRestDay) {
    premiumValue = await loadRegulatoryValue(supabase, rules.jurisdictionCode, 'rest_day_overtime_rate');
  } else if (isNight) {
    premiumValue = await loadRegulatoryValue(supabase, rules.jurisdictionCode, 'overtime_rate_night');
  } else {
    premiumValue = await loadRegulatoryValue(supabase, rules.jurisdictionCode, 'overtime_rate_day');
  }

  const premium = toOptionalNumber(premiumValue);
  if (premium === undefined) {
    throw new NotImplementedInJurisdiction(
      rules.jurisdictionCode,
      `PayrollService.calculateOvertime — overtime premium rate is not configured`,
    );
  }

  const hourlyRate = basicSalary / adjustedHours;
  const amount = roundToMinorUnits(hourlyRate * overtimeHours * (1 + premium), 2);
  return { amount, currencyCode: rules.currencyCode };
}
