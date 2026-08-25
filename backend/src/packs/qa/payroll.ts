/**
 * src/packs/qa/payroll.ts
 *
 * Qatar payroll adapter: end-of-service gratuity, leave entitlements and overtime
 * per Law No. 14 of 2004. WPS SIF generation is a stub because the file layout is
 * bank-specific. Qatarisation quota is a stub because no numeric sector quota has
 * been published.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import { calculateEndOfServiceBenefit, calculateOvertime } from '../../lib/payroll.js';
import { calculatePeriodPayroll } from '../../lib/periodPayroll.js';
import type { PayrollService, GosiResult } from '../contract/CountryPack.js';

const CURRENCY_CODE = 'QAR';
const JURISDICTION_CODE = 'QA';

const GRATUITY_RULES = {
  currencyCode: CURRENCY_CODE,
  tiers: [{ years: Infinity, daysPerYear: 21 }], // not less than 3 weeks per year
};

const OVERTIME_RULES = {
  currencyCode: CURRENCY_CODE,
  jurisdictionCode: JURISDICTION_CODE,
  allowRestDay: true,
};

function calculateAnnualLeave(yearsOfService: number, _isPartTime = false): number {
  if (yearsOfService < 1) return 0;
  if (yearsOfService < 5) return 21; // not less than 3 weeks
  return 28; // not less than 4 weeks
}

async function qaCalculateOvertime(
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
    'PayrollService.calculateGosi — GOSI/Social Security does not apply to Qatar private-sector employees',
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
    // Qatar private sector: no GOSI-equivalent payroll deduction in v1 (GRSIA/pension TBD)
    socialSecurity: () => ({ employee: 0, employer: 0, wage: 0, is_national: false }),
  });
}

function generateWpsFile(): Promise<{ filename: string; content: string }> {
  return Promise.reject(
    new NotImplementedInJurisdiction(
      JURISDICTION_CODE,
      'PayrollService.generateWpsFile — Qatar WPS SIF layout is bank-specific and must be configured at onboarding',
    ),
  );
}

export const qaPayroll: PayrollService = {
  calculateEndOfServiceBenefit: (basicSalary, yearsOfService, nationality, options) =>
    calculateEndOfServiceBenefit(basicSalary, yearsOfService, nationality, GRATUITY_RULES, options),
  calculateAnnualLeave,
  calculateOvertime: qaCalculateOvertime,
  calculateGosi,
  calculatePayroll,
  generateWpsFile,
};
