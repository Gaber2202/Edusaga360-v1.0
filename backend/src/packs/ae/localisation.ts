/**
 * src/packs/ae/localisation.ts
 *
 * UAE localisation: AED currency, Arabic/English number formatting, Dubai
 * timezone and Saturday-Sunday weekend.
 */

import {
  toMinorUnits,
  toMajorUnits,
  roundToMinorUnits,
} from '../../lib/money.js';
import type { LocalisationService, CurrencyFormatOptions } from '../contract/CountryPack.js';

const DEFAULT_CURRENCY = 'AED';
const DEFAULT_LOCALE = 'en-AE';
const DEFAULT_MINOR_UNITS = 2;

function formatMoney(options: CurrencyFormatOptions): string {
  const {
    value,
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    minimumFractionDigits = DEFAULT_MINOR_UNITS,
    maximumFractionDigits = DEFAULT_MINOR_UNITS,
  } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

function formatNumber(value: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}

export const aeLocalisation: LocalisationService = {
  formatMoney,
  toMinorUnits: (amount, minorUnits = DEFAULT_MINOR_UNITS) => toMinorUnits(amount, minorUnits),
  toMajorUnits: (amountMinor, minorUnits = DEFAULT_MINOR_UNITS) => toMajorUnits(amountMinor, minorUnits),
  roundToMinorUnits: (amount, minorUnits = DEFAULT_MINOR_UNITS) => roundToMinorUnits(amount, minorUnits),
  formatNumber,
};
