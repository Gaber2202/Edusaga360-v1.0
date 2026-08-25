/**
 * src/packs/ae/payroll.ts
 *
 * UAE payroll adapter: end-of-service gratuity, leave entitlements and overtime
 * per Federal Decree-Law No. 33 of 2021. GOSI does not apply; WPS file
 * generation is a stub because the SIF layout is bank-specific.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import { calculateEndOfServiceBenefit, calculateOvertime } from '../../lib/payroll.js';
import { calculatePeriodPayroll } from '../../lib/periodPayroll.js';
import type { PayrollService, GosiResult } from '../contract/CountryPack.js';

const CURRENCY_CODE = 'AED';
const JURISDICTION_CODE = 'AE';

const GRATUITY_RULES = {
  currencyCode: CURRENCY_CODE,
  tiers: [
    { years: 5, daysPerYear: 21 },
    { years: Infinity, daysPerYear: 30 },
  ],
  capYears: 2,
  nationalityExemptions: ['emirati', 'uae'],
};

const OVERTIME_RULES = {
  currencyCode: CURRENCY_CODE,
  jurisdictionCode: JURISDICTION_CODE,
  allowRestDay: false,
};

function calculateAnnualLeave(yearsOfService: number, _isPartTime = false): number {
  if (yearsOfService < 1) return 0;
  // UAE annual leave is 30 days per year once the one-year threshold is met.
  return 30;
}

async function aeCalculateOvertime(
  basicSalary: number,
  normalHoursPerMonth: number,
  overtimeHours: number,
  isNight = false,
  isRestDay = false,
  date?: Date | string,
  supabase?: unknown,
): Promise<{ amount: number; currencyCode: string }> {
  return calculateOvertime(basicSalary, normalHoursPerMonth, overtimeHours, OVERTIME_RULES, {
    isNight,
    isRestDay,
    date,
    supabase,
  });
}

function calculateGosi(_basicSalary: number, _nationality?: string): GosiResult {
  throw new NotImplementedInJurisdiction(
    JURISDICTION_CODE,
    'PayrollService.calculateGosi — GOSI/Social Security does not apply to UAE private-sector employees',
  );
}

function calculatePayroll(
  supabase: unknown,
  tenantId: string,
  period: { start: string; end: string },
  employeeIds?: string[],
  branchId?: string,
): Promise<unknown> {
  return calculatePeriodPayroll(supabase as import('@supabase/supabase-js').SupabaseClient, tenantId, period, {
    employeeIds,
    branchId,
    currencyCode: CURRENCY_CODE,
    jurisdictionCode: JURISDICTION_CODE,
    // UAE private sector: no GOSI-equivalent payroll deduction in v1
    socialSecurity: () => ({ employee: 0, employer: 0, wage: 0, is_national: false }),
  });
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
  calculateEndOfServiceBenefit: (basicSalary, yearsOfService, nationality, options) =>
    calculateEndOfServiceBenefit(basicSalary, yearsOfService, nationality, GRATUITY_RULES, options),
  calculateAnnualLeave,
  calculateOvertime: aeCalculateOvertime,
  calculateGosi,
  calculatePayroll,
  generateWpsFile,
};
