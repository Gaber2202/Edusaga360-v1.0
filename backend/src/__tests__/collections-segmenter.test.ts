import { describe, it, expect } from 'vitest';
import { RuleSegmentScorer, DEFAULT_SEGMENT_RULES } from '../services/collections/segmenter.js';
import type { SegmentFeatures } from '../services/collections/types.js';

const scorer = new RuleSegmentScorer();

function features(overrides: Partial<SegmentFeatures> = {}): SegmentFeatures {
  return {
    avgDaysToPay: 5,
    missedInstallmentsCount: 0,
    partialPaymentRatio: 0,
    outstandingBalance: 0,
    totalInvoiced: 1000,
    totalCollected: 1000,
    currentOverdue30Plus: 0,
    currentOverdue60Plus: 0,
    currentOverdue90Plus: 0,
    hasActivePlan: false,
    hadPlanEver: false,
    crossTermDefault: false,
    messageReplyCount: 0,
    ...overrides,
  };
}

describe('RuleSegmentScorer', () => {
  it('segments reliable payers as A', () => {
    const result = scorer.score(features(), DEFAULT_SEGMENT_RULES);
    expect(result.segment).toBe('A');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('segments slow payers as B', () => {
    const result = scorer.score(features({ avgDaysToPay: 10, outstandingBalance: 100 }), DEFAULT_SEGMENT_RULES);
    expect(result.segment).toBe('B');
  });

  it('segments struggling payers as C when they have partial payments', () => {
    const result = scorer.score(
      features({ partialPaymentRatio: 0.5, outstandingBalance: 500, currentOverdue30Plus: 0 }),
      DEFAULT_SEGMENT_RULES,
    );
    expect(result.segment).toBe('C');
  });

  it('segments at-risk payers as D when overdue >30 days and no reply', () => {
    const result = scorer.score(
      features({ currentOverdue30Plus: 1, outstandingBalance: 500, messageReplyCount: 0 }),
      DEFAULT_SEGMENT_RULES,
    );
    expect(result.segment).toBe('D');
  });

  it('segments high-risk payers as E when 90+ days overdue', () => {
    const result = scorer.score(
      features({ currentOverdue90Plus: 1, crossTermDefault: true, outstandingBalance: 1000 }),
      DEFAULT_SEGMENT_RULES,
    );
    expect(result.segment).toBe('E');
  });
});
