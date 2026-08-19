import { describe, it, expect } from 'vitest';
import { applyAttendanceFilters, presetRange, filtersAreActive } from '../lib/attendanceFilters';

const rows = [
  { id: '1', status: 'present', date: '2026-08-01' },
  { id: '2', status: 'absent', date: '2026-08-10' },
  { id: '3', status: 'late', date: '2026-08-17' },
];

describe('applyAttendanceFilters', () => {
  it('returns all rows when no filters are set', () => {
    expect(applyAttendanceFilters(rows, { status: 'all' })).toHaveLength(3);
  });

  it('filters by status', () => {
    expect(applyAttendanceFilters(rows, { status: 'absent' }).map((r) => r.id)).toEqual(['2']);
  });

  it('filters by inclusive date range', () => {
    expect(applyAttendanceFilters(rows, { from: '2026-08-10', to: '2026-08-17' }).map((r) => r.id)).toEqual(['2', '3']);
  });
});

describe('presetRange', () => {
  it('builds a 7-day window ending today', () => {
    expect(presetRange('7d', new Date('2026-08-17'))).toEqual({ from: '2026-08-11', to: '2026-08-17' });
  });

  it('starts this month on the first', () => {
    expect(presetRange('month', new Date('2026-08-17'))).toEqual({ from: '2026-08-01', to: '2026-08-17' });
  });
});

describe('filtersAreActive', () => {
  it('is false for the default all-status empty dates', () => {
    expect(filtersAreActive({ status: 'all', from: '', to: '' })).toBe(false);
  });

  it('is true when a status or date is set', () => {
    expect(filtersAreActive({ status: 'late', from: '', to: '' })).toBe(true);
    expect(filtersAreActive({ status: 'all', from: '2026-08-01', to: '' })).toBe(true);
  });
});
