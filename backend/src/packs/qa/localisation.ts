/**
 * src/packs/qa/localisation.ts
 *
 * Qatar localisation: QAR currency, Arabic-first formatting, Friday-Saturday
 * weekend. Locale and weekend can be overridden at tenant/branch level; the
 * pack supplies the jurisdiction defaults.
 */

import {
  toMinorUnits,
  toMajorUnits,
  roundToMinorUnits,
} from '../../lib/money.js';
import type { LocalisationService, CurrencyFormatOptions } from '../contract/CountryPack.js';

const DEFAULT_CURRENCY = 'QAR';
const DEFAULT_LOCALE = 'ar-QA';
const DEFAULT_MINOR_UNITS = 2;
const DEFAULT_WEEKEND = [5, 6]; // Friday, Saturday per Qatar weekend.

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

function getDefaultLocale(): string {
  return DEFAULT_LOCALE;
}

function getDefaultWeekend(): number[] {
  return DEFAULT_WEEKEND;
}

export const qaLocalisation: LocalisationService = {
  formatMoney,
  toMinorUnits: (amount, minorUnits = DEFAULT_MINOR_UNITS) => toMinorUnits(amount, minorUnits),
  toMajorUnits: (amountMinor, minorUnits = DEFAULT_MINOR_UNITS) => toMajorUnits(amountMinor, minorUnits),
  roundToMinorUnits: (amount, minorUnits = DEFAULT_MINOR_UNITS) => roundToMinorUnits(amount, minorUnits),
  formatNumber,
  getDefaultLocale,
  getDefaultWeekend,
};
