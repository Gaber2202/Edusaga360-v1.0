/**
 * src/packs/sa/feeGovernance.ts
 *
 * Saudi fee governance: discount/sibling-rule application. Fee-structure
 * resolution is not yet a standalone backend capability.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import { roundToMinorUnits } from '../../lib/money.js';
import type { FeeGovernanceService } from '../contract/CountryPack.js';

export async function applyDiscounts(
  supabase: SupabaseClient,
  tenant_id: string,
  student_id: string,
  academic_year: string,
  subtotal: number,
  category_id?: string,
): Promise<{ total_discount: number; applied: { rule_id: string; code: string; amount: number; description_ar: string; description_en: string }[] }> {
  const { data: rules } = await supabase
    .from('discount_rules')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .or(`academic_year.is.null,academic_year.eq.${academic_year}`)
    .order('priority', { ascending: true });

  if (!rules?.length) return { total_discount: 0, applied: [] };

  // Fetch student record for sibling/scholarship checks
  const { data: student } = await supabase
    .from('students')
    .select('id, guardian_id, grade_id')
    .eq('id', student_id)
    .eq('tenant_id', tenant_id)
    .single();

  // Count active siblings from same guardian
  let siblingRank = 1;
  if (student?.guardian_id) {
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .eq('guardian_id', student.guardian_id)
      .neq('id', student_id)
      .eq('status', 'active');
    siblingRank = (count ?? 0) + 1;
  }

  let runningSubtotal = subtotal;
  const applied: { rule_id: string; code: string; amount: number; description_ar: string; description_en: string }[] = [];
  let stackingBlocked = false;

  for (const rule of rules) {
    if (stackingBlocked) break;

    // Category filter
    if (rule.applies_to !== 'all' && category_id) {
      try {
        const cats: string[] = JSON.parse(rule.applies_to);
        if (!cats.includes(category_id)) continue;
      } catch { continue; }
    }

    // Check conditions
    const cond = rule.conditions ?? {};
    if (rule.discount_type === 'sibling') {
      const minSiblings: number = cond.min_siblings ?? 2;
      const targetRank: number = cond.sibling_rank ?? 2;
      if (siblingRank < targetRank || siblingRank < minSiblings) continue;
    }
    if (rule.discount_type === 'scholarship') {
      // scholarship_code not currently stored on student; skip this rule type
      continue;
    }

    // Calculate discount amount
    let amount = 0;
    if (rule.calculation === 'percentage') {
      amount = roundToMinorUnits(runningSubtotal * (rule.value / 100), 2);
      if (rule.max_amount) amount = Math.min(amount, rule.max_amount);
    } else {
      amount = Math.min(rule.value, runningSubtotal);
    }

    if (amount <= 0) continue;

    applied.push({
      rule_id: rule.id,
      code: rule.code,
      amount,
      description_ar: rule.name_ar,
      description_en: rule.name_en,
    });

    runningSubtotal = roundToMinorUnits(runningSubtotal - amount, 2);

    if (rule.stacking === 'blocked') stackingBlocked = true;
    if (rule.stacking === 'override') break;
  }

  return {
    total_discount: roundToMinorUnits(subtotal - runningSubtotal, 2),
    applied,
  };
}

export const saFeeGovernance: FeeGovernanceService = {
  resolveFeeStructures: async () => {
    throw new NotImplementedInJurisdiction('SA', 'FeeGovernanceService.resolveFeeStructures — see ADR-006 / Task 8b');
  },

  applyDiscounts: (
    supabase,
    tenantId: string,
    input: {
      studentId: string;
      academicYear: string;
      subtotal: number;
      categoryId?: string;
    },
  ) => applyDiscounts(supabase as SupabaseClient, tenantId, input.studentId, input.academicYear, input.subtotal, input.categoryId),
};
