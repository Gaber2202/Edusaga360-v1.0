/**
 * src/packs/sa/localisation.ts
 *
 * Saudi localisation: SAR currency, Arabic/English number formatting.
 */

import {
  toMinorUnits,
  toMajorUnits,
  roundToMinorUnits,
} from '../../lib/money.js';
import type { LocalisationService, LocalizationConfig, CurrencyFormatOptions } from '../contract/CountryPack.js';

function formatMoney(options: CurrencyFormatOptions): string {
  const {
    value,
    currency = 'SAR',
    locale = 'en-SA',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

function formatNumber(value: number, locale = 'en-SA'): string {
  return new Intl.NumberFormat(locale).format(value);
}

function getDefaultLocale(): string {
  return 'en-SA';
}

function getDefaultWeekend(): number[] {
  return [5, 6]; // Friday, Saturday per Saudi weekend.
}

export const saLocalisation: LocalisationService = {
  formatMoney,
  toMinorUnits: (amount, minorUnits = 2) => toMinorUnits(amount, minorUnits),
  toMajorUnits: (amountMinor, minorUnits = 2) => toMajorUnits(amountMinor, minorUnits),
  roundToMinorUnits: (amount, minorUnits = 2) => roundToMinorUnits(amount, minorUnits),
  formatNumber,
  getDefaultLocale,
  getDefaultWeekend,
};

export const saLocalization: LocalizationConfig = {
  currencyCode: 'SAR',
  currencySymbol: { en: 'SAR', ar: 'ر.س' },
  minorUnits: 2,
  numberFormat: { locale: 'en-SA', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
  dateFormat: { locale: 'en-SA', options: { year: 'numeric', month: 'short', day: 'numeric' } },
  calendarSystems: ['gregorian', 'hijri'],
  textDirection: 'rtl',
};
