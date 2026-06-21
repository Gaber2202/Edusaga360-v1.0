import { describe, it, expect } from 'vitest';
import { money, itemAmount, itemDesc, fmtDate } from '../lib/invoiceFormat';

describe('invoiceFormat — null-safe invoice rendering (fixes "can\'t view/download invoice")', () => {
  it('money formats numbers, numeric strings, and null without crashing', () => {
    expect(money(5000)).toBe('5,000.00');
    expect(money('23.00')).toBe('23.00'); // Supabase returns numeric columns as strings
    expect(money(null)).toBe('0.00');
    expect(money(undefined)).toBe('0.00');
  });

  it('itemAmount reads ZATCA line-item fields — the bug was assuming `amount`', () => {
    expect(itemAmount({ total: 23, unit_amount: 20, subtotal: 20 })).toBe(23);
    expect(itemAmount({ unit_amount: 20 })).toBe(20);
    expect(itemAmount({ subtotal: 15 })).toBe(15);
    expect(itemAmount({ amount: 9 })).toBe(9); // legacy invoices
    expect(itemAmount({})).toBe(0); // no amount field at all → 0, never throws
    expect(itemAmount(undefined)).toBe(0);
  });

  it('itemDesc picks the language with graceful fallback', () => {
    expect(itemDesc({ description_en: 'Tuition', description_ar: 'رسوم' }, false)).toBe('Tuition');
    expect(itemDesc({ description_en: 'Tuition', description_ar: 'رسوم' }, true)).toBe('رسوم');
    expect(itemDesc({ description_ar: 'رسوم' }, false)).toBe('رسوم'); // falls back when EN missing
    expect(itemDesc({}, false)).toBe('');
  });

  it('fmtDate returns an em-dash for null/invalid instead of throwing', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
    expect(fmtDate('not-a-date')).toBe('—');
    expect(fmtDate('2026-06-21')).toBe('21/06/2026');
  });
});
