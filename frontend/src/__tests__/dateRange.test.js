import { describe, it, expect } from 'vitest';
import { withinLastDays, filterByDateRange, recordDate } from '../lib/dateRange';

const NOW = new Date('2026-06-20T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('withinLastDays', () => {
  it('includes dates inside the window', () => {
    expect(withinLastDays(daysAgo(3), 7, NOW)).toBe(true);
    expect(withinLastDays(daysAgo(0), 7, NOW)).toBe(true);
  });
  it('excludes dates outside the window', () => {
    expect(withinLastDays(daysAgo(10), 7, NOW)).toBe(false);
  });
  it('handles missing/invalid dates', () => {
    expect(withinLastDays(null, 7, NOW)).toBe(false);
    expect(withinLastDays('not-a-date', 7, NOW)).toBe(false);
  });
});

describe('recordDate', () => {
  it('prefers created_date, then created_at, then date', () => {
    expect(recordDate({ created_date: 'a', created_at: 'b', date: 'c' })).toBe('a');
    expect(recordDate({ created_at: 'b', date: 'c' })).toBe('b');
    expect(recordDate({ date: 'c' })).toBe('c');
    expect(recordDate({})).toBeNull();
  });
});

describe('filterByDateRange', () => {
  const items = [
    { id: 1, created_date: daysAgo(2) },
    { id: 2, created_date: daysAgo(20) },
    { id: 3, created_date: daysAgo(60) },
    { id: 4 }, // no date — kept
  ];

  it('keeps only records within the window (plus undated ones)', () => {
    const ids = filterByDateRange(items, 7, NOW).map((i) => i.id);
    expect(ids).toEqual([1, 4]);
  });

  it('widens with the window', () => {
    const ids = filterByDateRange(items, 30, NOW).map((i) => i.id);
    expect(ids).toEqual([1, 2, 4]);
  });

  it('returns everything when days is falsy or non-positive', () => {
    expect(filterByDateRange(items, 0, NOW)).toHaveLength(4);
    expect(filterByDateRange(items, undefined, NOW)).toHaveLength(4);
  });
});
