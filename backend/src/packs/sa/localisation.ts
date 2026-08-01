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
import type { LocalisationService, CurrencyFormatOptions } from '../contract/CountryPack.js';

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

export const saLocalisation: LocalisationService = {
  formatMoney,
  toMinorUnits: (amount, minorUnits = 2) => toMinorUnits(amount, minorUnits),
  toMajorUnits: (amountMinor, minorUnits = 2) => toMajorUnits(amountMinor, minorUnits),
  roundToMinorUnits: (amount, minorUnits = 2) => roundToMinorUnits(amount, minorUnits),
  formatNumber,
};
