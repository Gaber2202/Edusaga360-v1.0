/**
 * src/packs/sa/payroll.ts
 *
 * Saudi payroll adapter. GOSI calculation is delegated to the existing route
 * helper; full payroll run and WPS file generation remain route-bound and are
 * left as typed TODOs pending the Task 8b / ADR-006 migration.
 */

import { calculateGosiForEmployee } from '../../routes/payroll.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { PayrollService, GosiResult } from '../contract/CountryPack.js';

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
