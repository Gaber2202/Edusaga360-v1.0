/**
 * Golden-file tests for Saudi Hijri (Umm al-Qura) ↔ Gregorian conversions.
 *
 * These conversions are used by the ZATCA invoice PDF, payroll calendars, and
 * any government-report date formatting that moves into packs/sa.
 */
import { describe, it } from 'vitest';
import {
  gregorianToHijri,
  hijriToGregorian,
  hijriNumeric,
  formatHijri,
} from '../../packs/sa/hijri.js';
import { golden } from './support/golden.js';

describe('Saudi Umm al-Qura golden snapshots', () => {
  it('Gregorian → Hijri parts are stable', () => {
    const h = gregorianToHijri('2026-06-18');
    golden('sa-hijri-gregorian-to-hijri', JSON.stringify(h), 'json');
  });

  it('Hijri numeric string is stable', () => {
    golden('sa-hijri-numeric', hijriNumeric('2026-06-18'), 'json');
  });

  it('Arabic Hijri formatting is stable', () => {
    golden('sa-hijri-arabic', formatHijri('2026-06-18', 'ar'), 'txt');
  });

  it('English Hijri formatting is stable', () => {
    golden('sa-hijri-english', formatHijri('2026-06-18', 'en'), 'txt');
  });

  it('Hijri → Gregorian is stable', () => {
    const d = hijriToGregorian(1448, 1, 3);
    golden('sa-hijri-to-gregorian', d.toISOString().split('T')[0], 'txt');
  });
});
