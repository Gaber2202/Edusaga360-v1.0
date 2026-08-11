const FALLBACK = {
  currencyCode: undefined,
  currencySymbol: { en: '', ar: '' },
  minorUnits: 2,
  numberFormat: { locale: 'en-SA', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
  dateFormat: { locale: 'en-SA', options: { year: 'numeric', month: 'short', day: 'numeric' } },
  calendarSystems: ['gregorian'],
  textDirection: 'ltr',
};

function resolveLocale(localization, isRTL) {
  const base = localization?.numberFormat?.locale || FALLBACK.numberFormat.locale;
  if (!isRTL) return base;
  return base.replace(/^en/, 'ar');
}

export function formatCurrency(value, localization, isRTL = false) {
  if (value === null || value === undefined) return '—';
  if (Number.isNaN(Number(value))) return String(value);
  const loc = resolveLocale(localization, isRTL);
  const currencyCode = localization?.currencyCode || FALLBACK.currencyCode;
  if (!currencyCode) {
    // Localization not resolved yet; show a placeholder instead of an unlabelled number.
    return '—';
  }
  const opts = {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: localization?.numberFormat?.options?.minimumFractionDigits ?? FALLBACK.numberFormat.options.minimumFractionDigits,
    maximumFractionDigits: localization?.numberFormat?.options?.maximumFractionDigits ?? FALLBACK.numberFormat.options.maximumFractionDigits,
  };
  return new Intl.NumberFormat(loc, opts).format(Number(value));
}

export function formatNumber(value, localization, isRTL = false) {
  if (value === null || value === undefined) return '—';
  if (Number.isNaN(Number(value))) return String(value);
  const loc = resolveLocale(localization, isRTL);
  const opts = localization?.numberFormat?.options || FALLBACK.numberFormat.options;
  return new Intl.NumberFormat(loc, opts).format(Number(value));
}

export function getCurrencySymbol(localization, isRTL = false) {
  const symbol = localization?.currencySymbol;
  if (!symbol) {
    return isRTL ? FALLBACK.currencySymbol.ar : FALLBACK.currencySymbol.en;
  }
  return isRTL ? symbol.ar : symbol.en;
}

export function getCurrencyCode(source) {
  return source?.currency_code ?? source?.localization?.currencyCode ?? source?.currencyCode ?? '';
}

export function formatDate(date, localization, isRTL = false, options = null) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const loc = (isRTL ? localization?.dateFormat?.locale?.replace(/^en/, 'ar') : localization?.dateFormat?.locale) || FALLBACK.dateFormat.locale;
  const baseOpts = options || localization?.dateFormat?.options || FALLBACK.dateFormat.options;
  const opts = { ...baseOpts, calendar: 'gregory' };
  return new Intl.DateTimeFormat(loc, opts).format(d);
}

export function formatDateTime(date, localization, isRTL = false) {
  const dateOpts = localization?.dateFormat?.options || FALLBACK.dateFormat.options;
  return formatDate(date, localization, isRTL, { ...dateOpts, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
