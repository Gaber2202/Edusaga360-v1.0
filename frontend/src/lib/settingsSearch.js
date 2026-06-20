/**
 * Pure search/filter for the Settings hub (P3.1).
 *
 * Given the grouped settings catalog and a query string, returns only the
 * categories/items that match (by item title/description in either language, or
 * by category title). Empty categories are dropped. An empty query returns the
 * catalog unchanged. Pure + unit-tested so the hub's search stays predictable.
 */
export function filterSettingsCatalog(categories = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return categories;
  const hit = (s) => String(s || '').toLowerCase().includes(q);

  return categories
    .map((cat) => {
      // A category-title match keeps the whole group.
      if (hit(cat.titleEn) || hit(cat.titleAr)) return cat;
      const items = (cat.items || []).filter(
        (it) => hit(it.titleEn) || hit(it.titleAr) || hit(it.descEn) || hit(it.descAr)
      );
      return { ...cat, items };
    })
    .filter((cat) => (cat.items || []).length > 0);
}

export default filterSettingsCatalog;
