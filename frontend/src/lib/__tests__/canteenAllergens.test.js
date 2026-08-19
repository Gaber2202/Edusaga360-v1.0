import { describe, it, expect } from 'vitest';
import { itemAllergenHits, studentAllergens } from '../canteenAllergens';

describe('canteen allergen matching', () => {
  it('flags a menu item that shares a parent-set allergen', () => {
    const hits = itemAllergenHits(
      { allergens: ['gluten', 'dairy'] },
      { canteen_allergens: ['dairy'] },
    );
    expect(hits).toEqual(['dairy']);
  });

  it('returns no hits when the student has no allergies', () => {
    expect(itemAllergenHits({ allergens: ['nuts'] }, { canteen_allergens: [] })).toEqual([]);
  });

  it('parses comma-separated allergy text', () => {
    expect(studentAllergens({ allergies: 'Nuts, Dairy' })).toEqual(['nuts', 'dairy']);
  });
});
