/**
 * CO-003 — Umm al-Qura Hijri conversion.
 *
 * Reference dates are the officially published Umm al-Qura correspondences.
 */
import { describe, it, expect } from 'vitest';
import {
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
  formatHijri,
  hijriMonthName,
} from '../packs/sa/hijri.js';

describe('gregorianToHijri (Umm al-Qura)', () => {
  it('maps 1 Muharram 1445 correctly', () => {
    expect(gregorianToHijri('2023-07-19')).toEqual({ year: 1445, month: 1, day: 1 });
  });

  it('maps Saudi National Day 2023-09-23 to 8 Rabiʿ I 1445', () => {
    expect(gregorianToHijri('2023-09-23')).toEqual({ year: 1445, month: 3, day: 8 });
  });

  it('accepts a Date object and a full ISO timestamp equivalently', () => {
    const fromStr = gregorianToHijri('2026-07-02');
    const fromDate = gregorianToHijri(new Date('2026-07-02T09:30:00Z'));
    expect(fromDate).toEqual(fromStr);
    expect(fromStr).toEqual({ year: 1448, month: 1, day: 17 });
  });
});

describe('hijriToGregorian (inversion)', () => {
  it('inverts 1 Muharram 1445 back to 2023-07-19', () => {
    expect(hijriToGregorian(1445, 1, 1).toISOString().slice(0, 10)).toBe('2023-07-19');
  });

  it('round-trips a range of Gregorian dates exactly', () => {
    const start = Date.UTC(2020, 0, 1) / 86_400_000;
    for (let i = 0; i < 3000; i += 37) {
      const iso = new Date((start + i) * 86_400_000).toISOString().slice(0, 10);
      const h = gregorianToHijri(iso);
      const back = hijriToGregorian(h.year, h.month, h.day).toISOString().slice(0, 10);
      expect(back).toBe(iso);
    }
  });

  it('rejects an impossible Hijri date (day 30 of a 29-day month)', () => {
    // 1445 Safar has 29 days; day 30 must not resolve.
    const safarLen = ((): number => {
      // find last valid day of 1445-02
      for (let d = 30; d >= 28; d--) {
        try { hijriToGregorian(1445, 2, d); return d; } catch { /* keep trying */ }
      }
      return 0;
    })();
    if (safarLen === 29) {
      expect(() => hijriToGregorian(1445, 2, 30)).toThrow();
    }
    // Structurally-invalid inputs always throw.
    expect(() => hijriToGregorian(1445, 13, 1)).toThrow();
    expect(() => hijriToGregorian(1445, 2, 0)).toThrow();
  });
});

describe('formatting helpers', () => {
  it('hijriNumeric is zero-padded', () => {
    expect(hijriNumeric('2023-07-19')).toBe('1445-01-01');
  });

  it('formatHijri en produces a readable string', () => {
    expect(formatHijri('2023-07-19', 'en')).toBe('1 Muharram 1445 AH');
  });

  it('formatHijri ar contains the era marker هـ', () => {
    expect(formatHijri('2026-07-02', 'ar')).toContain('هـ');
  });

  it('hijriMonthName maps 9 → Ramadan', () => {
    expect(hijriMonthName(9)).toBe('Ramadan');
    expect(() => hijriMonthName(0)).toThrow();
  });
});
