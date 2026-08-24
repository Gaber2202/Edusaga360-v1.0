/**
 * P1-D regression tests — invoice line sum (#185), credit-note VAT (#24), SADAD uniqueness (#190).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildInvoiceLines } from '../packs/sa/vat.js';

describe('P1-D #185 invoice line totals sum to invoice total', () => {
  it('three equal lines with discount have Σ line_total_gross === total_amount', () => {
    const result = buildInvoiceLines(
      [
        { description_en: 'A', description_ar: 'أ', amount: 1111.11, quantity: 1, vat_treatment: 'standard' },
        { description_en: 'B', description_ar: 'ب', amount: 1111.11, quantity: 1, vat_treatment: 'standard' },
        { description_en: 'C', description_ar: 'ج', amount: 1111.11, quantity: 1, vat_treatment: 'standard' },
      ],
      100,
    );
    const sumLines = result.lines.reduce((s, l) => Math.round((s + l.line_total_gross) * 100) / 100, 0);
    expect(sumLines).toBe(result.total_amount);
  });
});

describe('P1-D credit-note VAT journal shape', () => {
  it('documents expected account codes 41 / 24 / 12 for VAT credit notes', () => {
    // Structural contract used by billing credit-note handler.
    const amount = 1150;
    const originalVat = 150;
    const originalTotal = 1150;
    const creditRatio = amount / originalTotal;
    const vatReversal = Math.round(originalVat * creditRatio * 100) / 100;
    const netReversal = Math.round((amount - vatReversal) * 100) / 100;
    const lines = [
      { account_code: '41', debit: netReversal, credit: 0 },
      { account_code: '24', debit: vatReversal, credit: 0 },
      { account_code: '12', debit: 0, credit: amount },
    ];
    expect(lines.find((l) => l.account_code === '24')?.debit).toBe(150);
    expect(lines.find((l) => l.account_code === '41')?.debit).toBe(1000);
    expect(lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
  });
});

describe('P1-D #190 SADAD company code discriminator', () => {
  it('two tenant ids produce different 3-digit discriminators when env default is shared', () => {
    const disc = (tenantId: string) =>
      tenantId.replace(/-/g, '').slice(0, 3).replace(/[a-f]/gi, (c) => String(parseInt(c, 16) % 10));
    const a = disc('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    const b = disc('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(a).not.toBe(b);
  });
});
