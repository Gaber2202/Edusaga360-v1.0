/**
 * src/packs/sa/payroll.ts
 *
 * Saudi payroll adapter: GOSI rates, nationality checks, and (eventually) full
 * payroll / WPS generation. Full payroll run and WPS file generation remain TODOs
 * pending the Task 8b / ADR-006 migration.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { PayrollService, GosiResult } from '../contract/CountryPack.js';

// ─── GOSI Rates (Saudi Labour Law / GOSI regulations) ─────────────────────

export const GOSI_CAP_MONTHLY = 45_000;

const GOSI_SAUDI = {
  employee: 0.09,
  employer: 0.1175,
} as const;

const GOSI_EXPAT = {
  employee: 0.015,
  employer: 0.02,
} as const;

export function isSaudi(nationality: string | null | undefined): boolean {
  if (!nationality) return false;
  const n = nationality.toLowerCase().trim();
  return n === 'saudi' || n === 'saudi arabia' || n === 'sa' || n === 'سعودي';
}

export function calculateGosiForEmployee(
  basic_salary: number,
  nationality: string | null | undefined,
): {
  gosi_wage: number;
  gosi_employee: number;
  gosi_employer: number;
  is_saudi: boolean;
  rates: { employee: number; employer: number };
} {
  const gosiWage = Math.min(basic_salary, GOSI_CAP_MONTHLY);
  const saudi = isSaudi(nationality);
  const rates = saudi ? GOSI_SAUDI : GOSI_EXPAT;

  return {
    gosi_wage: gosiWage,
    gosi_employee: Math.round(gosiWage * rates.employee * 100) / 100,
    gosi_employer: Math.round(gosiWage * rates.employer * 100) / 100,
    is_saudi: saudi,
    rates,
  };
}

export const saPayroll: PayrollService = {
  calculateGosi: (basicSalary: number, nationality: string): GosiResult => {
    const r = calculateGosiForEmployee(basicSalary, nationality);
    return {
      employee: r.gosi_employee,
      employer: r.gosi_employer,
      total: Math.round((r.gosi_employee + r.gosi_employer) * 100) / 100,
    };
  },

  calculatePayroll: async () => {
    throw new NotImplementedInJurisdiction('SA', 'PayrollService.calculatePayroll — see ADR-006 / Task 8b');
  },

  generateWpsFile: async () => {
    throw new NotImplementedInJurisdiction('SA', 'PayrollService.generateWpsFile — see ADR-006 / Task 8b');
  },
};
