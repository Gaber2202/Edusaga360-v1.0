/**
 * src/services/discounts.ts
 *
 * Generic discount/sibling-rule application. Discount eligibility is a school
 * business-policy concern, not a jurisdiction-specific rule, so it lives in a
 * shared service per ADR-007.
 *
 * Enterprise default (SCRUM-128): when no active sibling discount_rules exist,
 * apply 5% for the first sibling (rank 2) and 10% for the second sibling+
 * (rank 3+), ranked by enrollment_date within the guardian family.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { roundToMinorUnits } from '../lib/money.js';
import {
  assignSiblingRanks,
  enterpriseSiblingDiscountAmount,
  siblingDiscountPercent,
} from './bulkInvoiceEngine.js';

export interface AppliedDiscount {
  rule_id: string;
  code: string;
  amount: number;
  description_ar: string;
  description_en: string;
}

export interface ApplyDiscountsResult {
  total_discount: number;
  applied: AppliedDiscount[];
}

export async function applyDiscounts(
  supabase: SupabaseClient,
  tenant_id: string,
  student_id: string,
  academic_year: string,
  subtotal: number,
  category_id?: string,
): Promise<ApplyDiscountsResult> {
  const { data: rules } = await supabase
    .from('discount_rules')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .or(`academic_year.is.null,academic_year.eq.${academic_year}`)
    .order('priority', { ascending: true });

  const { data: student } = await supabase
    .from('students')
    .select('id, guardian_id, grade_id, enrollment_date')
    .eq('id', student_id)
    .eq('tenant_id', tenant_id)
    .single();

  let siblingRank = 1;
  if (student?.guardian_id) {
    const { data: family } = await supabase
      .from('students')
      .select('id, guardian_id, enrollment_date')
      .eq('tenant_id', tenant_id)
      .eq('guardian_id', student.guardian_id)
      .eq('status', 'active');
    const ranks = assignSiblingRanks(family ?? [student]);
    siblingRank = ranks.get(student_id) ?? 1;
  }

  if (!rules?.length) {
    return applyEnterpriseSiblingFallback(subtotal, siblingRank);
  }

  let runningSubtotal = subtotal;
  const applied: AppliedDiscount[] = [];
  let stackingBlocked = false;

  for (const rule of rules) {
    if (stackingBlocked) break;

    if (rule.applies_to !== 'all' && category_id) {
      try {
        const cats: string[] = JSON.parse(rule.applies_to);
        if (!cats.includes(category_id)) continue;
      } catch {
        continue;
      }
    }

    const cond = rule.conditions ?? {};
    if (rule.discount_type === 'sibling') {
      const minSiblings: number = cond.min_siblings ?? 2;
      const targetRank: number = cond.sibling_rank ?? 2;
      if (siblingRank < targetRank || siblingRank < minSiblings) continue;
    }
    if (rule.discount_type === 'scholarship') {
      continue;
    }

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

  const hasSiblingRules = rules.some((r) => r.discount_type === 'sibling');
  if (!hasSiblingRules) {
    const fallback = applyEnterpriseSiblingFallback(runningSubtotal, siblingRank);
    for (const d of fallback.applied) applied.push(d);
    runningSubtotal = roundToMinorUnits(runningSubtotal - fallback.total_discount, 2);
  }

  return {
    total_discount: roundToMinorUnits(subtotal - runningSubtotal, 2),
    applied,
  };
}

function applyEnterpriseSiblingFallback(
  subtotal: number,
  siblingRank: number,
): ApplyDiscountsResult {
  const amount = enterpriseSiblingDiscountAmount(subtotal, siblingRank);
  if (amount <= 0) return { total_discount: 0, applied: [] };
  const pct = siblingDiscountPercent(siblingRank);
  return {
    total_discount: amount,
    applied: [
      {
        rule_id: 'enterprise-sibling-default',
        code: siblingRank === 2 ? 'SIBLING_1' : 'SIBLING_2',
        amount,
        description_ar: siblingRank === 2 ? 'خصم الأخ الأول 5%' : 'خصم الأخ الثاني 10%',
        description_en:
          siblingRank === 2
            ? `First sibling discount ${pct}%`
            : `Second sibling discount ${pct}%`,
      },
    ],
  };
}
