export const CANTEEN_ALLERGENS = ['nuts', 'dairy', 'gluten', 'eggs', 'soy', 'fish', 'shellfish'];

export const ALLERGEN_LABELS = {
  nuts: { ar: 'مكسرات', en: 'Nuts' },
  dairy: { ar: 'ألبان', en: 'Dairy' },
  gluten: { ar: 'غلوتين', en: 'Gluten' },
  eggs: { ar: 'بيض', en: 'Eggs' },
  soy: { ar: 'صويا', en: 'Soy' },
  fish: { ar: 'سمك', en: 'Fish' },
  shellfish: { ar: 'محار', en: 'Shellfish' },
};

export function allergenLabel(key, isRTL) {
  return ALLERGEN_LABELS[key]?.[isRTL ? 'ar' : 'en'] || key;
}

export function studentAllergens(student) {
  const raw = student?.canteen_allergens ?? student?.allergens ?? student?.allergies ?? [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,،]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export function itemAllergenHits(item, student) {
  const itemKeys = (item?.allergens || []).map((a) => String(a).toLowerCase());
  const studentKeys = studentAllergens(student).map((a) => String(a).toLowerCase());
  return itemKeys.filter((a) => studentKeys.includes(a));
}
