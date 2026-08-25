/**
 * Enterprise bulk invoice engine (SCRUM-128).
 *
 * Pure helpers shared by dry-run preview and real generation so preview totals
 * always match what would be written. Sibling discounts and mid-term proration
 * are fixed product rules for v1.
 */

export const FIRST_SIBLING_DISCOUNT_PCT = 5;
export const SECOND_SIBLING_DISCOUNT_PCT = 10;

/** Inclusive day count between two ISO dates (YYYY-MM-DD). */
export function dayCountInclusive(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * Mid-term join proration: remaining days in term / total term days × fee.
 * Full fee when join is on/before term start; zero when join is after term end.
 */
export function prorateMidTermFee(
  feeAmount: number,
  termStart: string,
  termEnd: string,
  joinDate?: string | null,
): { amount: number; factor: number; prorated: boolean } {
  const fee = Number(feeAmount) || 0;
  if (!joinDate || joinDate <= termStart) {
    return { amount: round2(fee), factor: 1, prorated: false };
  }
  if (joinDate > termEnd) {
    return { amount: 0, factor: 0, prorated: true };
  }
  const totalDays = dayCountInclusive(termStart, termEnd);
  const remainingDays = dayCountInclusive(joinDate, termEnd);
  if (totalDays <= 0) return { amount: round2(fee), factor: 1, prorated: false };
  const factor = remainingDays / totalDays;
  return { amount: round2(fee * factor), factor, prorated: true };
}

/**
 * Sibling discount percent by family rank (enrollment_date ascending).
 * Rank 1 (first enrolled) = 0%; first sibling (rank 2) = 5%; second+ = 10%.
 */
export function siblingDiscountPercent(rank: number): number {
  if (rank <= 1) return 0;
  if (rank === 2) return FIRST_SIBLING_DISCOUNT_PCT;
  return SECOND_SIBLING_DISCOUNT_PCT;
}

export function enterpriseSiblingDiscountAmount(subtotal: number, rank: number): number {
  const pct = siblingDiscountPercent(rank);
  if (pct <= 0 || subtotal <= 0) return 0;
  return round2(subtotal * (pct / 100));
}

export interface SiblingRankStudent {
  id: string;
  guardian_id?: string | null;
  enrollment_date?: string | null;
}

/** Assign 1-based ranks within each guardian family (enrollment_date, then id). */
export function assignSiblingRanks(students: SiblingRankStudent[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const byGuardian = new Map<string, SiblingRankStudent[]>();

  for (const s of students) {
    const key = s.guardian_id ? String(s.guardian_id) : `__solo_${s.id}`;
    const list = byGuardian.get(key) ?? [];
    list.push(s);
    byGuardian.set(key, list);
  }

  for (const list of byGuardian.values()) {
    list.sort((a, b) => {
      const da = a.enrollment_date || '9999-12-31';
      const db = b.enrollment_date || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return String(a.id).localeCompare(String(b.id));
    });
    list.forEach((s, idx) => ranks.set(s.id, idx + 1));
  }

  return ranks;
}

export type BulkPlanStatus =
  | 'eligible'
  | 'already_invoiced'
  | 'excluded'
  | 'no_fees'
  | 'failed';

export interface BulkPlanRow {
  student_id: string;
  status: BulkPlanStatus;
  subtotal: number;
  discount: number;
  total: number;
  sibling_rank?: number;
  prorated?: boolean;
  proration_factor?: number;
  error?: string;
}

export interface BulkRunLogEntry {
  student_id: string;
  status: BulkPlanStatus | 'created';
  amount?: number;
  error?: string;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
