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
import type { PayrollService } from '../contract/CountryPack.js';

const CURRENCY_CODE = 'AED';

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

function calculateOvertime(
  basicSalary: number,
  normalHoursPerMonth: number,
  overtimeHours: number,
  isNight = false,
  isRestDay = false,
  date?: Date | string,
): { amount: number; currencyCode: string } {
  if (normalHoursPerMonth <= 0 || overtimeHours <= 0) {
    return { amount: 0, currencyCode: CURRENCY_CODE };
  }

  if (isRestDay) {
    throw new NotImplementedInJurisdiction(
      'AE',
      'PayrollService.calculateOvertime — rest-day overtime premium is not specified in UAE Labour Law',
    );
  }

  // UAE Labour Law reduces working hours by 2 hours per day during Ramadan.
  // We assume an 8-hour normal day and scale the monthly norm accordingly.
  let adjustedHours = normalHoursPerMonth;
  if (date && isRamadan(date)) {
    const workingDays = normalHoursPerMonth / 8;
    if (workingDays > 0) {
      adjustedHours = roundToMinorUnits(workingDays * 6, 2);
    }
  }

  const hourlyRate = basicSalary / adjustedHours;
  const premium = isNight ? 0.50 : 0.25;

  const amount = roundToMinorUnits(hourlyRate * overtimeHours * (1 + premium), 2);
  return { amount, currencyCode: CURRENCY_CODE };
}

function calculatePayroll(): Promise<unknown> {
  return Promise.reject(
    new NotImplementedInJurisdiction(
      'AE',
      'PayrollService.calculatePayroll — full period payroll calculation not yet implemented for UAE',
    ),
  );
}

function generateWpsFile(): Promise<{ filename: string; content: string }> {
  return Promise.reject(
    new NotImplementedInJurisdiction(
      'AE',
      'PayrollService.generateWpsFile — UAE WPS SIF layout is bank-specific and must be configured at onboarding',
    ),
  );
}

export const aePayroll: PayrollService = {
  calculateEndOfServiceBenefit,
  calculateAnnualLeave,
  calculateOvertime,
  calculatePayroll,
  generateWpsFile,
};
