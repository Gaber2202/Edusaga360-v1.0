/**
 * VAT rate resolution — frontend single source of truth.
 *
 * Business context: KSA VAT has moved 0% → 5% → 15% over time, so the rate is
 * read from the active tenant (with a safe fallback) rather than hard-coded.
 * Finance correctness depends on getVatRate() interpreting both decimal (0.15)
 * and percentage (15) storage forms and never returning a nonsensical rate.
 */
import { describe, it, expect } from 'vitest';
import { getVatRate, DEFAULT_VAT_RATE } from '@/lib/vatRate';

describe('getVatRate', () => {
  it('defaults to 15% when no tenant is provided', () => {
    expect(getVatRate(null)).toBe(0.15);
    expect(getVatRate(undefined)).toBe(DEFAULT_VAT_RATE);
    expect(getVatRate({})).toBe(0.15);
  });

  it('reads a decimal rate stored on the tenant', () => {
    expect(getVatRate({ vat_rate: 0.05 })).toBe(0.05);
    expect(getVatRate({ vat_rate: 0 })).toBe(0); // zero-rated tenant is valid
  });

  it('tolerates a percentage stored as a whole number (15 → 0.15)', () => {
    expect(getVatRate({ vat_rate: 15 })).toBe(0.15);
    expect(getVatRate({ vat_rate: 5 })).toBe(0.05);
  });

  it('accepts a numeric string from the database', () => {
    expect(getVatRate({ vat_rate: '0.15' })).toBe(0.15);
    expect(getVatRate({ vat_rate: '15' })).toBe(0.15);
  });

  it('falls back to the default for invalid or out-of-range values', () => {
    expect(getVatRate({ vat_rate: 'abc' })).toBe(0.15);
    expect(getVatRate({ vat_rate: -1 })).toBe(0.15);
    expect(getVatRate({ vat_rate: 200 })).toBe(0.15);
    expect(getVatRate({ vat_rate: null })).toBe(0.15);
  });

  it('computes the correct VAT amount for a standard invoice line', () => {
    const rate = getVatRate({ vat_rate: 0.15 });
    expect(1000 * rate).toBeCloseTo(150);
  });
});
