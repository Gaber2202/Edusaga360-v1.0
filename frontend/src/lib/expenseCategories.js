/**
 * Expense categories + bilingual labels (P3.2).
 *
 * Single source of truth so the entry form and the table render the same set
 * (the table previously only labelled 5 of the 10 categories). Pure label
 * lookup, unit-tested.
 */
export const EXPENSE_CATEGORIES = [
  'travel', 'fuel', 'meals', 'accommodation', 'stationery',
  'software', 'training', 'marketing', 'utilities', 'other',
];

const LABELS = {
  travel: { en: 'Travel', ar: 'سفر' },
  fuel: { en: 'Fuel', ar: 'وقود' },
  meals: { en: 'Meals', ar: 'وجبات' },
  accommodation: { en: 'Accommodation', ar: 'إقامة' },
  stationery: { en: 'Stationery', ar: 'قرطاسية' },
  software: { en: 'Software', ar: 'برمجيات' },
  training: { en: 'Training', ar: 'تدريب' },
  marketing: { en: 'Marketing', ar: 'تسويق' },
  utilities: { en: 'Utilities', ar: 'خدمات' },
  other: { en: 'Other', ar: 'أخرى' },
};

export function expenseCategoryLabel(category, isRTL) {
  const l = LABELS[category];
  if (!l) return category;
  return isRTL ? l.ar : l.en;
}

export default expenseCategoryLabel;
