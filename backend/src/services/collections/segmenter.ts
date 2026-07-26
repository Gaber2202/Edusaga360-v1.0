import { SegmentFeatures, SegmentResult, SegmentScorer, Segment } from './types.js';

export const DEFAULT_SEGMENT_RULES = {
  reliableDaysMax: 7,
  slowDaysMin: 7,
  slowDaysMax: 30,
  strugglerPartialRatioMin: 0.01,
  strugglerHasPlanPenalty: false,
  riskDaysMin: 30,
  chronicDaysMin: 90,
  chronicOutstandingMin: 1,
};

/**
 * v1 deterministic segment scorer. Designed as a pure function so it can be
 * replaced by a learned model later without changing the caller.
 */
export class RuleSegmentScorer implements SegmentScorer {
  version = 'rule_v1';

  score(input: SegmentFeatures, rules: Record<string, unknown> = {}): SegmentResult {
    const r = { ...DEFAULT_SEGMENT_RULES, ...rules } as typeof DEFAULT_SEGMENT_RULES;

    const partialRatio = input.partialPaymentRatio;
    const avgDays = input.avgDaysToPay;
    const hasOutstanding = input.outstandingBalance > 0;

    // E — chronic/legal: repeated/cross-term default or very old outstanding.
    if (
      input.crossTermDefault ||
      (input.currentOverdue90Plus > 0 && input.outstandingBalance >= r.chronicOutstandingMin)
    ) {
      return {
        segment: 'E',
        confidence: 0.95,
        reason: input.crossTermDefault
          ? 'cross_term_default'
          : 'overdue_90_plus_chronic',
        features: input,
        modelVersion: 'none',
        ruleVersion: this.version,
      };
    }

    // D — silent risk: >30 days overdue and not responding.
    if (
      input.currentOverdue30Plus > 0 &&
      (!input.lastPaymentAt || new Date(input.lastPaymentAt).getTime() < Date.now() - 30 * 86400000) &&
      input.messageReplyCount === 0
    ) {
      return {
        segment: 'D',
        confidence: 0.9,
        reason: 'overdue_30_plus_unresponsive',
        features: input,
        modelVersion: 'none',
        ruleVersion: this.version,
      };
    }

    // C — struggler: partial payments or currently active broken plan.
    if (
      partialRatio >= r.strugglerPartialRatioMin ||
      (input.hasActivePlan && hasOutstanding)
    ) {
      return {
        segment: 'C',
        confidence: 0.85,
        reason: partialRatio >= r.strugglerPartialRatioMin ? 'partial_payment_history' : 'active_plan_with_outstanding',
        features: input,
        modelVersion: 'none',
        ruleVersion: this.version,
      };
    }

    // B — slow but safe: pays 7-30 days late but completes.
    if (avgDays > r.slowDaysMin && avgDays <= r.slowDaysMax && input.missedInstallmentsCount === 0) {
      return {
        segment: 'B',
        confidence: 0.85,
        reason: 'pays_7_30_days_late_no_misses',
        features: input,
        modelVersion: 'none',
        ruleVersion: this.version,
      };
    }

    // A — reliable: pays on time or <7 days late.
    if (avgDays <= r.reliableDaysMax && input.missedInstallmentsCount === 0) {
      return {
        segment: 'A',
        confidence: 0.9,
        reason: 'on_time_or_few_days_late',
        features: input,
        modelVersion: 'none',
        ruleVersion: this.version,
      };
    }

    // Fallback: anything else with outstanding is D risk; without outstanding treat as B.
    if (hasOutstanding) {
      return {
        segment: 'D',
        confidence: 0.7,
        reason: 'outstanding_default_fallback',
        features: input,
        modelVersion: 'none',
        ruleVersion: this.version,
      };
    }

    return {
      segment: 'B',
      confidence: 0.7,
      reason: 'slow_no_outstanding_fallback',
      features: input,
      modelVersion: 'none',
      ruleVersion: this.version,
    };
  }
}
