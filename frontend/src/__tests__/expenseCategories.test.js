import { describe, it, expect } from 'vitest';
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from '../lib/expenseCategories';

describe('expenseCategoryLabel (P3.2)', () => {
  it('returns English and Arabic labels', () => {
    expect(expenseCategoryLabel('travel', false)).toBe('Travel');
    expect(expenseCategoryLabel('travel', true)).toBe('سفر');
    expect(expenseCategoryLabel('software', false)).toBe('Software');
    expect(expenseCategoryLabel('utilities', true)).toBe('خدمات');
  });

  it('labels every category in both languages (table/form parity)', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(expenseCategoryLabel(cat, false)).not.toBe(cat);
      expect(expenseCategoryLabel(cat, true)).not.toBe(cat);
    }
  });

  it('falls back to the raw key for an unknown category', () => {
    expect(expenseCategoryLabel('mystery', false)).toBe('mystery');
  });
});
