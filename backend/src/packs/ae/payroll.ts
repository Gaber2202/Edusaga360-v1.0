/**
 * src/packs/ae/payroll.ts
 *
 * UAE payroll adapter: end-of-service gratuity, leave entitlements and overtime
 * per Federal Decree-Law No. 33 of 2021. GOSI does not apply; WPS file
 * generation is a stub because the SIF layout is bank-specific.
 */

import { roundToMinorUnits } from '../../lib/money.js';
import { isRamadan } from '../../lib/hijri.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { PayrollService, GosiResult } from '../contract/CountryPack.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const CURRENCY_CODE = 'AED';
const JURISDICTION_CODE = 'AE';

function calculateEndOfServiceBenefit(
  basicSalary: number,
  yearsOfService: number,
  nationality?: string,
): { amount: number; currencyCode: string } {
  // Nationals are covered by pensions/social security, not this foreign-worker
  // gratuity. This helper is intended for non-national employees.
  if ((nationality ?? '').toLowerCase() === 'emirati' || (nationality ?? '').toLowerCase() === 'uae') {
    return { amount: 0, currencyCode: CURRENCY_CODE };
  }

  const wholeYears = Math.floor(yearsOfService);
  const fraction = yearsOfService - wholeYears;

  let days = 0;
  if (wholeYears > 0) {
    const first5 = Math.min(wholeYears, 5);
    const after5 = Math.max(wholeYears - 5, 0);
    days = first5 * 21 + after5 * 30;
  }
  if (fraction > 0 && yearsOfService >= 1) {
    days += fraction * (wholeYears >= 5 ? 30 : 21);
  }

  // Cap at 2 years of basic wage.
  const annualWage = basicSalary * 12;
  const maxDays = 365 * 2;
  days = Math.min(days, maxDays);

  const dailyWage = annualWage / 365;
  const amount = Math.round(dailyWage * days * 100) / 100;

  return { amount, currencyCode: CURRENCY_CODE };
}

function calculateAnnualLeave(yearsOfService: number, _isPartTime = false): number {
  if (yearsOfService < 1) return 0;
  if (yearsOfService < 5) return 30;
  return 30;
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
  parameterKey: string,
  asOf?: Date | string,
): Promise<unknown | undefined> {
  const target = asOf ? (typeof asOf === 'string' ? asOf.slice(0, 10) : asOf.toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
  const { data, error } = await (supabase as SupabaseClient)
    .from('regulatory_register')
    .select('parameter_value')
    .eq('jurisdiction_code', JURISDICTION_CODE)
    .eq('parameter_key', parameterKey)
    .lte('effective_from', target)
    .gte('effective_to', target)
    .maybeSingle();

  if (error) throw error;
  if (!data) return undefined;
  return data.parameter_value;
}

async function calculateOvertime(
  basicSalary: number,
  normalHoursPerMonth: number,
  overtimeHours: number,
  isNight = false,
  isRestDay = false,
  date?: Date | string,
  supabase?: unknown,
): Promise<{ amount: number; currencyCode: string }> {
  if (normalHoursPerMonth <= 0 || overtimeHours <= 0) {
    return { amount: 0, currencyCode: CURRENCY_CODE };
  }

  if (isRestDay) {
    throw new NotImplementedInJurisdiction(
      JURISDICTION_CODE,
      'PayrollService.calculateOvertime — rest-day overtime premium is not specified in UAE Labour Law',
    );
  }

  let adjustedHours = normalHoursPerMonth;

  if (date && isRamadan(date)) {
    if (!supabase) {
      throw new NotImplementedInJurisdiction(
        JURISDICTION_CODE,
        'PayrollService.calculateOvertime — Ramadan working-hour reduction cannot be applied without effective-dated regulatory parameters',
      );
    }

    const dailyHoursValue = await loadRegulatoryValue(supabase, 'working_hours_per_day');
    const dailyHours = toOptionalNumber(dailyHoursValue);
    if (dailyHours === undefined || dailyHours <= 0) {
      throw new NotImplementedInJurisdiction(
        JURISDICTION_CODE,
        'PayrollService.calculateOvertime — normal daily working hours are not configured',
      );
    }

    const reductionValue = await loadRegulatoryValue(supabase, 'ramadan_working_hours_reduction');
    const reduction = toOptionalNumber(reductionValue);
    if (reduction === undefined) {
      throw new NotImplementedInJurisdiction(
        JURISDICTION_CODE,
        'PayrollService.calculateOvertime — Ramadan working-hour reduction is not verified in regulatory_register',
      );
    }

    const workingDays = normalHoursPerMonth / dailyHours;
    if (workingDays > 0) {
      adjustedHours = roundToMinorUnits(workingDays * (dailyHours - reduction), 2);
    }
  }

  const hourlyRate = basicSalary / adjustedHours;
  const premium = isNight ? 0.50 : 0.25;

  const amount = roundToMinorUnits(hourlyRate * overtimeHours * (1 + premium), 2);
  return { amount, currencyCode: CURRENCY_CODE };
}

function calculateGosi(_basicSalary: number, _nationality?: string): GosiResult {
  throw new NotImplementedInJurisdiction(
    JURISDICTION_CODE,
    'PayrollService.calculateGosi — GOSI/Social Security does not apply to UAE private-sector employees',
  );
}

function calculatePayroll(): Promise<unknown> {
  return Promise.reject(
    new NotImplementedInJurisdiction(
      JURISDICTION_CODE,
      'PayrollService.calculatePayroll — full period payroll calculation not yet implemented for UAE',
    ),
  );
}

function generateWpsFile(): Promise<{ filename: string; content: string }> {
  return Promise.reject(
    new NotImplementedInJurisdiction(
      JURISDICTION_CODE,
      'PayrollService.generateWpsFile — UAE WPS SIF layout is bank-specific and must be configured at onboarding',
    ),
  );
}

export const aePayroll: PayrollService = {
  calculateEndOfServiceBenefit,
  calculateAnnualLeave,
  calculateOvertime,
  calculateGosi,
  calculatePayroll,
  generateWpsFile,
};
