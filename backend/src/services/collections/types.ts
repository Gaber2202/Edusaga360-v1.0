export type Segment = 'A' | 'B' | 'C' | 'D' | 'E';

export interface SegmentFeatures {
  avgDaysToPay: number;
  missedInstallmentsCount: number;
  partialPaymentRatio: number;
  outstandingBalance: number;
  totalInvoiced: number;
  totalCollected: number;
  currentOverdue30Plus: number;
  currentOverdue60Plus: number;
  currentOverdue90Plus: number;
  hasActivePlan: boolean;
  hadPlanEver: boolean;
  lastPaymentAt?: string;
  crossTermDefault: boolean;
  messageReplyCount: number;
}

export interface SegmentResult {
  segment: Segment;
  confidence: number;
  reason: string;
  features: SegmentFeatures;
  modelVersion: string;
  ruleVersion: string;
}

export interface SegmentScorer {
  score(input: SegmentFeatures, rules?: Record<string, unknown>): SegmentResult;
  version: string;
}
