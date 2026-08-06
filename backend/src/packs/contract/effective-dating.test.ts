import { describe, expect, it } from 'vitest';
import { resolvePack } from '../registry.js';

describe('effective dating', () => {
  it('SA pack vatRateForCategory uses the historical 5% rate before 1 July 2020', () => {
    const pack = resolvePack({ tenant: { id: 'tenant-1', jurisdictionCode: 'SA' } });
    const rate = pack.tax?.vatRateForCategory?.('standard', undefined, '2019-01-15');
    expect(rate).toBe(0.05);
  });

  it('SA pack vatRateForCategory uses the current 15% rate from 1 July 2020 onward', () => {
    const pack = resolvePack({ tenant: { id: 'tenant-1', jurisdictionCode: 'SA' } });
    const rate = pack.tax?.vatRateForCategory?.('standard', undefined, '2021-01-15');
    expect(rate).toBe(0.15);
  });

  it('computeVatSummary reproduces the tax rate in force at the original issue date', () => {
    const pack = resolvePack({ tenant: { id: 'tenant-1', jurisdictionCode: 'SA' } });
    const historical = {
      invoice_number: 'INV-2019-000001',
      issue_date: '2019-04-01',
      subtotal: 1000,
      vat_amount: 50,
      total_amount: 1050,
      items: [{ description_en: 'Tuition', description_ar: 'رسوم دراسية', quantity: 1, unit_price_net: 1000 }],
    };
    const summary = pack.tax?.computeVatSummary?.(historical);
    expect(summary).toBeDefined();
    expect((summary as { total_vat: number }).total_vat).toBe(50);
    expect((summary as { rates: Array<{ rate: number }> }).rates[0]?.rate).toBe(0.05);
  });
});
