import { describe, it, expect } from 'vitest';
import { translations } from '../lib/LanguageContext';

describe('parent-portal i18n', () => {
  it('English and Arabic dictionaries have identical key sets', () => {
    const en = Object.keys(translations.en).sort();
    const ar = Object.keys(translations.ar).sort();
    expect(ar).toEqual(en);
  });

  it('no translation value is empty', () => {
    for (const locale of ['en', 'ar']) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(typeof value, `${locale}.${key}`).toBe('string');
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
