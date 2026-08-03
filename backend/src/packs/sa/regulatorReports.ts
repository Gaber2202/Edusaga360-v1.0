/**
 * src/packs/sa/regulatorReports.ts
 *
 * Saudi regulator reports: Nitaqat / Saudization calculation, VAT return,
 * and MHRSD workforce report generation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { RegulatorReportsService } from '../contract/CountryPack.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isSaudi(e: any): boolean {
  if (e.is_saudi === true) return true;
  if (e.nationality && /^(saudi|saudi arabia|sa|سعودي)$/i.test(String(e.nationality).trim())) return true;
  return false;
}

async function getNitaqatThresholds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ platinum: number; green: number; yellow: number }> {
  const { data } = await supabase
    .from('nitaqat_thresholds')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  return {
    platinum: Number(data?.platinum ?? 40),
    green: Number(data?.green ?? 25),
    yellow: Number(data?.yellow ?? 15),
  };
}

export interface NitaqatResult {
  headcount: number;
  saudiCount: number;
  saudizationPct: number;
  nitaqatBand: 'platinum' | 'green' | 'yellow' | 'red' | null;
  thresholds: { platinum: number; green: number; yellow: number };
  nitaqat: {
    band: 'platinum' | 'green' | 'yellow' | 'red' | null;
    saudization_pct: number;
    thresholds: { platinum: number; green: number; yellow: number };
    data_quality: 'real' | 'not_tracked';
  };
  workforce_composition: {
    by_department: Array<{
      department_id: string | null;
      name_en: string;
      name_ar: string;
      count: number;
    }>;
    by_gender: Record<string, number>;
    saudi_count: number;
    non_saudi_count: number;
  };
  saudi_vs_non_saudi: Array<{ name: string; value: number }>;
}

export async function calculateNitaqat(
  supabase: SupabaseClient,
  tenantId: string,
  options?: {
    branchId?: string;
    employees?: any[];
    departments?: any[];
  },
): Promise<NitaqatResult> {
  let employeesFull = options?.employees;
  let departments = options?.departments;

  if (!employeesFull) {
    let q = supabase
      .from('employees')
      .select('id, status, nationality, gender, department_id, is_saudi')
      .eq('tenant_id', tenantId);
    if (options?.branchId) q = q.eq('branch_id', options.branchId);
    const { data } = await q;
    employeesFull = (data ?? []) as any[];
  }

  if (!departments) {
    const { data } = await supabase
      .from('departments')
      .select('id, name_en, name_ar')
      .eq('tenant_id', tenantId);
    departments = (data ?? []) as any[];
  }

  const activeEmployees = employeesFull.filter((e: any) => e.status === 'active');
  const saudiCount = activeEmployees.filter(isSaudi).length;
  const headcount = activeEmployees.length;
  const saudizationPct = headcount > 0 ? round2((saudiCount / headcount) * 100) : 0;

  const thresholds = await getNitaqatThresholds(supabase, tenantId);
  let nitaqatBand: 'platinum' | 'green' | 'yellow' | 'red' | null = null;
  if (headcount > 0) {
    if (saudizationPct >= thresholds.platinum) nitaqatBand = 'platinum';
    else if (saudizationPct >= thresholds.green) nitaqatBand = 'green';
    else if (saudizationPct >= thresholds.yellow) nitaqatBand = 'yellow';
    else nitaqatBand = 'red';
  }

  const deptName = new Map(
    (departments as any[]).map((d: any) => [d.id, { en: d.name_en, ar: d.name_ar }]),
  );
  const byDepartment = new Map<string, number>();
  for (const e of activeEmployees) {
    const key = e.department_id ?? 'unassigned';
    byDepartment.set(key, (byDepartment.get(key) ?? 0) + 1);
  }
  const workforceByDepartment = [...byDepartment.entries()].map(([id, count]) => ({
    department_id: id === 'unassigned' ? null : id,
    name_en: deptName.get(id)?.en ?? 'Unassigned',
    name_ar: deptName.get(id)?.ar ?? 'غير محدد',
    count,
  }));

  const byGender = activeEmployees.reduce((acc: Record<string, number>, e: any) => {
    const key = e.gender ?? 'unspecified';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const saudiVsNonSaudi = [
    { name: 'saudi', value: saudiCount },
    { name: 'non_saudi', value: headcount - saudiCount },
  ];

  return {
    headcount,
    saudiCount,
    saudizationPct,
    nitaqatBand,
    thresholds,
    nitaqat: {
      band: nitaqatBand,
      saudization_pct: saudizationPct,
      thresholds,
      data_quality: headcount > 0 ? 'real' : 'not_tracked',
    },
    workforce_composition: {
      by_department: workforceByDepartment,
      by_gender: byGender,
      saudi_count: saudiCount,
      non_saudi_count: headcount - saudiCount,
    },
    saudi_vs_non_saudi: saudiVsNonSaudi,
  };
}

export const saRegulatorReports: RegulatorReportsService = {
  calculateNitaqat,

  calculateVatReturn: async () => {
    throw new NotImplementedInJurisdiction('SA', 'RegulatorReportsService.calculateVatReturn — see ADR-006 / Task 8b');
  },

  generateMHRSDReport: async () => {
    throw new NotImplementedInJurisdiction('SA', 'RegulatorReportsService.generateMHRSDReport — see ADR-006 / Task 8b');
  },
};
