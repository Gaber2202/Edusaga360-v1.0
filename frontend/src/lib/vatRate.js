// Single source of truth for the effective VAT rate.
//
// History: KSA's VAT rate went 0% → 5% → 15% (Jul 2020). It can change again
// (politically and fiscally). Hard-coding `0.15` in every calculator means
// the day the rate changes, Finance has to chase a dozen files. Read from
// the active tenant instead (with a sane fallback for tenants that haven't
// been migrated to a stored `vat_rate` field yet).
//
// If you ever see a hard-coded `0.15` appearing in a PR touching invoicing /
// VAT / POs, replace it with `getVatRate(tenant)`.

export const DEFAULT_VAT_RATE = 0.15;

/**
 * @param {object | null | undefined} tenant - the active Tenant record (as
 *   returned from useTenant() / TenantContext). May be null on first render.
 * @returns {number} VAT rate as a decimal (e.g. 0.15 for 15%).
 */
export function getVatRate(tenant) {
  const raw = tenant?.vat_rate;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  // Tolerate "15" stored as a percentage rather than a decimal.
  if (Number.isFinite(n) && n > 1 && n <= 100) return n / 100;
  return DEFAULT_VAT_RATE;
}
