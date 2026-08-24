/**
 * Unit tests — P1-E fee category tax treatment matrix.
 */
import { describe, it, expect } from 'vitest';
import {
  assertFeeCategoriesHaveTaxTreatment,
  resolveFeeCategoryTaxTreatment,
} from '../lib/feeCategoryTaxMatrix.js';

describe('feeCategoryTaxMatrix', () => {
  it('maps UAE tuition to zero-rated and transport to exempt', () => {
    expect(resolveFeeCategoryTaxTreatment('AE', 'TUITION')).toBe('zero_rated');
    expect(resolveFeeCategoryTaxTreatment('AE', 'TRANSPORT')).toBe('exempt');
    expect(resolveFeeCategoryTaxTreatment('AE', 'UNIFORM')).toBe('standard');
  });

  it('maps Qatar categories to out_of_scope (no VAT regime — explicit reason)', () => {
    expect(resolveFeeCategoryTaxTreatment('QA', 'TUITION')).toBe('out_of_scope');
    expect(resolveFeeCategoryTaxTreatment('QA', 'FOOD')).toBe('out_of_scope');
  });

  it('throws a named cause for unknown jurisdiction (ADR-002)', () => {
    expect(() => resolveFeeCategoryTaxTreatment('XX', 'TUITION')).toThrow(/tax_treatment_unresolved/);
  });

  it('throws a named cause for unmapped category code', () => {
    expect(() => resolveFeeCategoryTaxTreatment('SA', 'UNKNOWN_CAT')).toThrow(/tax_treatment_unresolved/);
  });

  it('activation gate fails loudly on missing mapping', () => {
    expect(() => assertFeeCategoriesHaveTaxTreatment('AE', ['TUITION', 'BOGUS'])).toThrow(/BOGUS|tax_treatment_unresolved/);
  });
});
