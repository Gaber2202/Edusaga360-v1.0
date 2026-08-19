import { describe, it, expect } from 'vitest';
import {
  attendanceRate,
  attendanceBreakdown,
  attendanceTrend,
  averageScore,
  latestSubjectScores,
  homeworkCounts,
  feesOutstanding,
} from '../lib/dashboardMetrics';

describe('dashboardMetrics', () => {
  it('computes attendance rate from present-like statuses', () => {
    expect(attendanceRate([])).toBeNull();
    expect(attendanceRate([
      { status: 'present' },
      { status: 'late' },
      { status: 'absent' },
      { status: 'excused' },
    ])).toBe(75);
  });

  it('breaks attendance down by status', () => {
    expect(attendanceBreakdown([
      { status: 'present' },
      { status: 'present' },
      { status: 'absent' },
    ])).toEqual({ present: 2, late: 0, absent: 1, excused: 0 });
  });

  it('builds a daily attendance trend', () => {
    const trend = attendanceTrend([
      { date: '2026-08-10', status: 'present' },
      { date: '2026-08-10', status: 'absent' },
      { date: '2026-08-11', status: 'present' },
    ]);
    expect(trend).toEqual([
      { date: '2026-08-10', rate: 50 },
      { date: '2026-08-11', rate: 100 },
    ]);
  });

  it('averages scores as percentages of max', () => {
    expect(averageScore([
      { score: 90, max_score: 100 },
      { score: 40, max_score: 50 },
    ])).toBe(85);
  });

  it('keeps the latest score per subject', () => {
    const subjects = latestSubjectScores([
      { subject: 'Math', score: 70, max_score: 100, created_at: '2026-01-01' },
      { subject: 'Math', score: 92, max_score: 100, created_at: '2026-03-01' },
      { subject: 'Arabic', score: 80, max_score: 100, created_at: '2026-02-01' },
    ]);
    expect(subjects[0]).toMatchObject({ subject: 'Math', pct: 92 });
    expect(subjects[1]).toMatchObject({ subject: 'Arabic', pct: 80 });
  });

  it('counts overdue homework separately from assigned', () => {
    const now = new Date('2026-08-17');
    expect(homeworkCounts([
      { status: 'assigned', due_date: '2026-08-01' },
      { status: 'assigned', due_date: '2026-08-20' },
      { status: 'submitted', due_date: '2026-08-01' },
    ], now)).toEqual({ assigned: 1, submitted: 1, graded: 0, overdue: 1 });
  });

  it('sums outstanding invoice balances', () => {
    expect(feesOutstanding([
      { total_amount: 1000, paid_amount: 1000, status: 'paid' },
      { total_amount: 4000, paid_amount: 1000, due_date: '2999-01-01' },
      { document_type: 'receipt', total_amount: 500, paid_amount: 0 },
    ])).toBe(3000);
  });
});
