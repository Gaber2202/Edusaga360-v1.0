/**
 * src/services/feeResolution.ts
 *
 * Generic fee-structure resolution. This is jurisdiction-neutral: every country
 * queries fee structures by tenant, academic year, grade, and branch/campus and
 * maps the rows to raw fee lines. Tax treatment and discount logic live in the
 * country pack, not here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedFeeStructure {
  id: string;
  category_id: string;
  category_code?: string | null;
  description_en: string;
  description_ar: string;
  vat_treatment: string;
  amount: number;
  quantity: number;
  grade?: string | null;
  campus_id?: string | null; // stale alias for branch_id; kept internal to the row
  program?: string | null;
  is_mandatory?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface ResolveFeeStructuresInput {
  academicYear: string;
  grade?: string;
  /** Branch id; internally mapped to fee_structures.campus_id (legacy alias). */
  branchId?: string;
  program?: string;
  mandatoryOnly?: boolean;
  /** As-of date for effective_from / effective_to filter (ISO date). Defaults to today. */
  asOf?: string;
  /** Jurisdiction code for fee-category tax treatment matrix (P1-E). */
  jurisdictionCode?: string;
}

function isEffectiveOn(fs: { effective_from?: string | null; effective_to?: string | null }, asOf: string): boolean {
  if (fs.effective_from && fs.effective_from > asOf) return false;
  if (fs.effective_to && fs.effective_to < asOf) return false;
  return true;
}

export async function resolveFeeStructures(
  supabase: SupabaseClient,
  tenantId: string,
  input: ResolveFeeStructuresInput,
): Promise<ResolvedFeeStructure[]> {
  let query = supabase
    .from('fee_structures')
    .select('*, fee_categories(id, vat_treatment, name_ar, name_en, code)')
    .eq('tenant_id', tenantId)
    .eq('academic_year', input.academicYear);

  if (input.mandatoryOnly !== false) {
    query = query.eq('is_mandatory', true);
  }
  if (input.program) {
    query = query.eq('program', input.program);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Grade/campus matching is done in memory to avoid building PostgREST `or(...)`
  // filter strings from request-controlled values. `fee_structures.campus_id` is
  // the legacy alias for branch_id (see issue #188).
  const grade = input.grade ?? null;
  const branchId = input.branchId ?? null;
  const asOf = input.asOf ?? new Date().toISOString().split('T')[0];

  return (data ?? [])
    .filter((fs) => {
      if (!isEffectiveOn(fs, asOf)) return false;
      if (grade != null && fs.grade != null && fs.grade !== grade) return false;
      if (
        branchId != null &&
        fs.campus_id != null &&
        String(fs.campus_id).toLowerCase() !== branchId.toLowerCase()
      ) return false;
      return true;
    })
    .map((fs) => {
      const cat = (fs.fee_categories as Record<string, unknown> | undefined) ?? {};
      const categoryCode = (cat.code as string | null) ?? null;
      // P1-E activation gate validates category codes; vat_treatment stays on the
      // fee_categories row (pack/buildInvoiceLines) unless a future pack hook applies matrix rates.
      return {
        id: fs.id as string,
        category_id: fs.category_id as string,
        category_code: categoryCode,
        description_en: (cat.name_en as string) ?? 'Fee',
        description_ar: (cat.name_ar as string) ?? 'رسوم',
        vat_treatment: (cat.vat_treatment as string) ?? 'standard',
        amount: Number(fs.amount ?? 0),
        quantity: 1,
        grade: (fs.grade as string | null) ?? null,
        campus_id: (fs.campus_id as string | null) ?? null,
        program: (fs.program as string | null) ?? null,
        is_mandatory: (fs.is_mandatory as boolean) ?? true,
        effective_from: (fs.effective_from as string | null) ?? null,
        effective_to: (fs.effective_to as string | null) ?? null,
      };
    });
}
