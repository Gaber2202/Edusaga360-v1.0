/**
 * Statutory leave entitlements from country packs (SCRUM-124).
 *
 * Seeds/updates the annual leave_type days_allowed from
 * pack.payroll.calculateAnnualLeave, and refreshes leave_balances.total_days
 * for active employees (remaining_days is a generated column).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRequestContext } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';

export interface LeaveEntitlementSyncResult {
  jurisdiction: string;
  annual_leave_days: number;
  leave_type_id: string | null;
  employees_updated: number;
  years_of_service_basis: number;
}

export function yearsOfService(hireDate: string | null | undefined, asOf = new Date()): number {
  if (!hireDate) return 1;
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) return 1;
  let years = asOf.getFullYear() - hire.getFullYear();
  const m = asOf.getMonth() - hire.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < hire.getDate())) years -= 1;
  return Math.max(0, years);
}

export async function syncStatutoryLeaveEntitlements(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { branchId?: string },
): Promise<LeaveEntitlementSyncResult> {
  const ctx = await buildRequestContext(supabase, tenantId, opts?.branchId);
  const pack = resolvePack(ctx);
  const calc = pack.payroll?.calculateAnnualLeave;
  if (!calc) {
    throw new Error(`Jurisdiction ${pack.code} does not expose calculateAnnualLeave`);
  }

  // Use a representative tenure (>=5 years) so annual leave_type.days_allowed
  // reflects the statutory ceiling; per-employee balances use actual tenure.
  const ceilingDays = calc(5);

  let leaveTypeId: string | null = null;
  const { data: existing } = await supabase
    .from('leave_types')
    .select('id, code, days_allowed')
    .eq('tenant_id', tenantId)
    .or('code.eq.annual,code.eq.ANNUAL,name_en.ilike.%annual%')
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    leaveTypeId = existing.id as string;
    await supabase
      .from('leave_types')
      .update({ days_allowed: ceilingDays })
      .eq('id', leaveTypeId)
      .eq('tenant_id', tenantId);
  } else {
    const { data: inserted, error } = await supabase
      .from('leave_types')
      .insert({
        tenant_id: tenantId,
        code: 'annual',
        name_en: 'Annual Leave',
        name_ar: 'إجازة سنوية',
        days_allowed: ceilingDays,
        is_paid: true,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    leaveTypeId = inserted.id as string;
  }

  let empQuery = supabase
    .from('employees')
    .select('id, hire_date, join_date, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  if (opts?.branchId) empQuery = empQuery.eq('branch_id', opts.branchId);
  const { data: employees, error: empErr } = await empQuery;
  if (empErr) throw empErr;

  let updated = 0;
  for (const emp of employees ?? []) {
    const yos = yearsOfService((emp.hire_date as string) || (emp.join_date as string));
    const entitled = calc(yos);
    const { data: bal } = await supabase
      .from('leave_balances')
      .select('id, used_days, total_days')
      .eq('tenant_id', tenantId)
      .eq('employee_id', emp.id)
      .eq('leave_type_id', leaveTypeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const used = Number(bal?.used_days ?? 0);
    const totalDays = Math.max(entitled, used);

    if (bal?.id) {
      await supabase
        .from('leave_balances')
        .update({ total_days: totalDays })
        .eq('id', bal.id)
        .eq('tenant_id', tenantId);
    } else {
      await supabase.from('leave_balances').insert({
        tenant_id: tenantId,
        employee_id: emp.id,
        leave_type_id: leaveTypeId,
        total_days: totalDays,
        used_days: 0,
      });
    }
    updated++;
  }

  return {
    jurisdiction: pack.code,
    annual_leave_days: ceilingDays,
    leave_type_id: leaveTypeId,
    employees_updated: updated,
    years_of_service_basis: 5,
  };
}
