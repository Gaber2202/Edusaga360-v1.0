import { describe, it, expect } from 'vitest';
import { filterSettingsCatalog } from '../lib/settingsSearch';

const CATALOG = [
  {
    key: 'academic', titleEn: 'Academic', titleAr: 'أكاديمي',
    items: [
      { key: 'grades', titleEn: 'Grades & Year Setup', titleAr: 'إعداد الصفوف', descEn: 'Define grades', descAr: 'تعريف الصفوف' },
      { key: 'fees', titleEn: 'Fee Structures', titleAr: 'هياكل الرسوم', descEn: 'Tuition per grade', descAr: 'الرسوم لكل صف' },
    ],
  },
  {
    key: 'access', titleEn: 'People & Access', titleAr: 'الأشخاص والصلاحيات',
    items: [
      { key: 'roles', titleEn: 'Roles & Permissions', titleAr: 'الأدوار والصلاحيات', descEn: 'Access control', descAr: 'التحكم بالوصول' },
    ],
  },
];

describe('filterSettingsCatalog (P3.1 settings search)', () => {
  it('returns the full catalog for an empty query', () => {
    expect(filterSettingsCatalog(CATALOG, '')).toEqual(CATALOG);
    expect(filterSettingsCatalog(CATALOG, '   ')).toEqual(CATALOG);
  });

  it('matches item titles case-insensitively and drops non-matching groups', () => {
    const res = filterSettingsCatalog(CATALOG, 'fee');
    expect(res).toHaveLength(1);
    expect(res[0].key).toBe('academic');
    expect(res[0].items.map((i) => i.key)).toEqual(['fees']);
  });

  it('matches Arabic titles', () => {
    const res = filterSettingsCatalog(CATALOG, 'الأدوار');
    expect(res).toHaveLength(1);
    expect(res[0].key).toBe('access');
  });

  it('matches item descriptions', () => {
    const res = filterSettingsCatalog(CATALOG, 'access control');
    expect(res).toHaveLength(1);
    expect(res[0].items[0].key).toBe('roles');
  });

  it('a category-title match keeps all of its items', () => {
    const res = filterSettingsCatalog(CATALOG, 'academic');
    expect(res).toHaveLength(1);
    expect(res[0].items).toHaveLength(2);
  });

  it('returns nothing when there is no match', () => {
    expect(filterSettingsCatalog(CATALOG, 'zzzz')).toEqual([]);
  });
});
