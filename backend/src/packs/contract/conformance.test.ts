import { describe, expect, it, vi } from 'vitest';
import { getRegisteredPacks } from '../registry.js';
import type { CountryPack } from './CountryPack.js';
import {
  createSupabaseStub,
  type QueryContext,
  type SupabaseResult,
} from '../../__tests__/support/supabaseMock.js';

// Pack modules may pull in lib/supabase at import time; never hit the real DB in conformance tests.
vi.mock('../../lib/supabase.js', () => ({ supabase: {} }));

function defaultResolver(ctx: QueryContext): SupabaseResult {
  if (ctx.table === 'tenants') {
    return { data: { id: 'tenant-1', slug: 'demo', name_en: 'Demo School' } };
  }
  if (ctx.table === 'nitaqat_thresholds') {
    return { data: null };
  }
  if (ctx.table === 'academic_years') {
    return {
      data: {
        id: 'year-1',
        name: '2025-2026',
        start_date: '2025-09-01',
        end_date: '2026-06-30',
        is_current: true,
      },
    };
  }
  if (ctx.table === 'invoices') {
    return {
      data: {
        id: 'inv-1',
        invoice_number: 'INV-CONF-001',
        total_amount: 1150,
        paid_amount: 0,
        due_date: '2026-01-31',
        branch_id: null,
        guardian_id: null,
        status: 'issued',
        document_type: 'invoice',
        currency_code: 'SAR',
        student_name: 'Student',
      },
    };
  }
  if (ctx.table === 'moyasar_invoices') {
    return { data: [] };
  }
  if (ctx.table === 'payments') {
    return { data: null };
  }
  if (ctx.table === 'payslip_lines') {
    return { data: [] };
  }
  if (ctx.table === 'jurisdiction_tax_rules') {
    return {
      data: [
        { category: 'standard', rate: 0.05, effective_from: '2018-01-01', effective_to: '9999-12-31' },
        { category: 'zero_rated', rate: 0, effective_from: '2018-01-01', effective_to: '9999-12-31' },
        { category: 'exempt', rate: 0, effective_from: '2018-01-01', effective_to: '9999-12-31' },
        { category: 'out_of_scope', rate: 0, effective_from: '2018-01-01', effective_to: '9999-12-31' },
      ],
    };
  }
  return { data: null };
}

function minimalInvoice(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uuid: '11111111-1111-1111-1111-111111111111',
    invoice_number: 'CONF-001',
    issue_date: '2026-01-15',
    document_type: 'invoice',
    invoice_type: 'simplified',
    zatca_invoice_type: 'simplified',
    subtotal: 1000,
    discount_amount: 0,
    vat_amount: 150,
    total_amount: 1150,
    paid_amount: 0,
    student_name: 'Student',
    buyer_name: 'Student',
    items: [
      {
        description_en: 'Tuition',
        description_ar: 'رسوم دراسية',
        quantity: 1,
        unit_price_net: 1000,
        vat_category: 'standard',
      },
    ],
    ...overrides,
  };
}

function minimalTenant(): Record<string, unknown> {
  return {
    name: 'Demo School',
    name_ar: 'مدرسة تجريبية',
    legal_name_en: 'Demo School',
    legal_name_ar: 'مدرسة تجريبية',
    vat_number: '300000000000003',
    address: 'Riyadh',
    address_ar: 'الرياض',
    address_en: 'Riyadh',
    city: 'Riyadh',
    country_code: 'SA',
    country_subentity_code: 'SA-01',
    cr_number: '1010101010',
    phone: '+966501234567',
    email: 'demo@example.com',
  };
}

function makeDefaultStub() {
  const stub = createSupabaseStub();
  stub.setResolver(defaultResolver);
  return stub;
}

function makeWpsStub() {
  const stub = createSupabaseStub();
  stub.setResolver((ctx) => {
    if (ctx.table === 'employees') {
      return {
        data: [
          {
            id: 'emp-1',
            employee_number: 'E001',
            nationality: 'Saudi',
            basic_salary: 10000,
            housing_allowance: 0,
            transport_allowance: 0,
            other_allowances: {},
            bank_name: 'Demo Bank',
            bank_iban: 'SA0380000000608016127519',
          },
        ],
      };
    }
    return defaultResolver(ctx);
  });
  return stub;
}

function isHex(str: string): boolean {
  return /^[0-9a-f]+$/i.test(str);
}

function isBase64(str: string): boolean {
  if (typeof str !== 'string' || str.length === 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0;
}

// This file is parameterised over every registered country pack. Adding a new
// jurisdiction should only require implementing the CountryPack contract; no new
// test files should be necessary.
describe.each(getRegisteredPacks().map((pack) => [pack.code, pack] as const))(
  'CountryPack conformance: %s',
  (_code, pack) => {
    it('exposes a non-empty jurisdiction code', () => {
      expect(pack.code).toBeTruthy();
      expect(typeof pack.code).toBe('string');
    });

    describe('tax', () => {
      it('vatRateForCategory returns a non-negative rate', () => {
        if (!pack.tax?.vatRateForCategory) return;
        const rate = pack.tax.vatRateForCategory('standard');
        expect(typeof rate).toBe('number');
        expect(rate).toBeGreaterThanOrEqual(0);
      });

      it('categoryCode maps a category to a short string', () => {
        if (!pack.tax?.categoryCode) return;
        const code = pack.tax.categoryCode('standard');
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      });

      it('computeVatSummary preserves line and document totals', async () => {
        if (!pack.tax?.computeVatSummary) return;
        const standardRate = pack.tax.vatRateForCategory?.('standard') ?? 0;
        const zeroRate = pack.tax.vatRateForCategory?.('zero_rated') ?? 0;

        const invoice = minimalInvoice({
          items: [
            { description_en: 'Standard', description_ar: 'قياسي', quantity: 1, unit_price_net: 1000, vat_category: 'standard' },
            { description_en: 'Zero', description_ar: 'صفرية', quantity: 1, unit_price_net: 200, vat_category: 'zero_rated' },
          ],
        });

        const stub = makeDefaultStub();
        const summary = (await pack.tax.computeVatSummary(invoice, stub.client)) as Record<string, unknown>;
        expect(summary).toBeTruthy();
        expect(typeof summary.total_vat).toBe('number');
        expect(typeof summary.total_taxable).toBe('number');
        expect((summary.total_vat as number) >= 0).toBe(true);
        expect((summary.total_taxable as number) >= 0).toBe(true);

        const rates = Array.isArray(summary.rates) ? (summary.rates as Array<Record<string, unknown>>) : [];
        const sumTaxable = rates.reduce((s, r) => s + (Number(r.taxable_amount) || 0), 0);
        const sumVat = rates.reduce((s, r) => s + (Number(r.vat_amount) || 0), 0);
        expect(sumTaxable).toBeCloseTo(summary.total_taxable as number, 2);
        expect(sumVat).toBeCloseTo(summary.total_vat as number, 2);

        if (standardRate > 0) {
          const standardEntry = rates.find((r) => Number(r.rate) === standardRate);
          expect(standardEntry).toBeTruthy();
          expect(Number(standardEntry!.vat_amount)).toBeCloseTo(
            Number(standardEntry!.taxable_amount) * standardRate,
            2,
          );
        }

        if (zeroRate === 0) {
          const zeroEntry = rates.find((r) => Number(r.rate) === 0);
          if (zeroEntry) {
            expect(Number(zeroEntry.vat_amount)).toBe(0);
          }
        }
      });
    });

    describe('e-invoicing', () => {
      const tenant = minimalTenant();
      const invoice = minimalInvoice();

      it('generateUBLXml produces XML containing the invoice number', () => {
        if (!pack.eInvoice?.generateUBLXml) return;
        const xml = pack.eInvoice.generateUBLXml(invoice, tenant);
        expect(typeof xml).toBe('string');
        expect(xml.length).toBeGreaterThan(0);
        expect(xml).toContain(invoice.invoice_number as string);
        expect(xml).toContain('<Invoice');
      });

      it('generateInvoiceHash produces a 64-character hex digest', () => {
        if (!pack.eInvoice?.generateInvoiceHash) return;
        const hash = pack.eInvoice.generateInvoiceHash('<xml/>');
        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64);
        expect(isHex(hash)).toBe(true);
      });

      it('generateTLVQR produces a non-empty base64 payload', () => {
        if (!pack.eInvoice?.generateTLVQR) return;
        const qr = pack.eInvoice.generateTLVQR(invoice, tenant, 'sig');
        expect(typeof qr).toBe('string');
        expect(qr.length).toBeGreaterThan(0);
        expect(isBase64(qr)).toBe(true);
      });

      it('buildInvoiceHTML is bilingual and contains required fields', () => {
        if (!pack.eInvoice?.buildInvoiceHTML) return;
        const html = pack.eInvoice.buildInvoiceHTML(invoice, tenant, 'data:image/png;base64,abc');
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain(invoice.invoice_number as string);
        expect(html).toContain((tenant.legal_name_en as string) || (tenant.name as string));
        expect(/rtl|dir=\"rtl\"|lang=\"ar\"/.test(html) || /[\u0600-\u06FF]/.test(html)).toBe(true);
      });
    });

    describe('documents', () => {
      it('renderInvoicePdf returns a non-empty Buffer', async () => {
        if (!pack.documents?.renderInvoicePdf) return;
        const pdf = await pack.documents.renderInvoicePdf(minimalInvoice(), minimalTenant());
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.length).toBeGreaterThan(0);
      }, 30_000);
    });

    describe('localisation', () => {
      it('toMinorUnits and toMajorUnits roundtrip for this pack', () => {
        if (!pack.localisation?.toMinorUnits || !pack.localisation?.toMajorUnits) return;
        const minor = pack.localisation.toMinorUnits(1.23);
        expect(Number.isFinite(minor)).toBe(true);
        const major = pack.localisation.toMajorUnits(minor);
        expect(Number.isFinite(major)).toBe(true);
        expect(major).toBeCloseTo(1.23, 2);

        expect(pack.localisation.toMinorUnits(0)).toBe(0);
        expect(pack.localisation.toMajorUnits(0)).toBe(0);
      });

      it('roundToMinorUnits trims to the pack minor-unit precision', () => {
        if (!pack.localisation?.roundToMinorUnits) return;
        const rounded = pack.localisation.roundToMinorUnits(1.2345);
        expect(Number.isFinite(rounded)).toBe(true);
        expect(rounded.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
      });

      it('formatMoney uses a currency code and formats the value', () => {
        if (!pack.localisation?.formatMoney) return;
        const formatted = pack.localisation.formatMoney({ value: 1234.5, currency: 'SAR' });
        expect(typeof formatted).toBe('string');
        expect(formatted.length).toBeGreaterThan(0);
        expect(formatted).toMatch(/1[\s,\.]*234/);
      });

      it('formatNumber returns a numeric string', () => {
        if (!pack.localisation?.formatNumber) return;
        const formatted = pack.localisation.formatNumber(1234.5);
        expect(typeof formatted).toBe('string');
        expect(formatted).toMatch(/\d/);
      });
    });

    describe('payroll', () => {
      it('calculateGosi returns non-negative contributions that sum to total', () => {
        if (!pack.payroll?.calculateGosi) return;
        const result = pack.payroll.calculateGosi(10000, 'any-nationality') as unknown as Record<string, unknown>;
        expect(typeof result).toBe('object');
        expect(Number(result.employee) >= 0).toBe(true);
        expect(Number(result.employer) >= 0).toBe(true);
        expect(Number(result.total) >= 0).toBe(true);
        expect(Number(result.total)).toBeCloseTo(Number(result.employee) + Number(result.employer), 2);
      });

      it('generateWpsFile produces pipe-delimited lines', async () => {
        if (!pack.payroll?.generateWpsFile) return;
        const stub = makeWpsStub();
        const result = (await pack.payroll.generateWpsFile(
          stub.client,
          'tenant-1',
          { start: '2026-01-01', end: '2026-01-31' },
        )) as { filename: string; content: string };
        expect(typeof result.filename).toBe('string');
        expect(result.filename.length).toBeGreaterThan(0);
        expect(typeof result.content).toBe('string');
        const lines = result.content.split('\n').filter((l) => l.trim());
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          const fields = line.split('|');
          expect(fields.length).toBe(6);
          expect(Number(fields[4])).toBeGreaterThanOrEqual(0);
        }
      });
    });

    describe('academic calendar', () => {
      it('currentAcademicYearForDate returns a year spanning the date', async () => {
        if (!pack.academicCalendar?.currentAcademicYearForDate) return;
        const stub = makeDefaultStub();
        const date = '2026-01-15';
        const year = (await pack.academicCalendar.currentAcademicYearForDate(
          stub.client,
          'tenant-1',
          date,
        )) as { start_date: string; end_date: string } | null;
        if (!year) return;
        expect(year).toHaveProperty('start_date');
        expect(year).toHaveProperty('end_date');
        expect(year.start_date <= date).toBe(true);
        expect(year.end_date >= date).toBe(true);
      });

      it('formatHijri returns a non-empty string', () => {
        if (!pack.academicCalendar?.formatHijri) return;
        const formatted = pack.academicCalendar.formatHijri('2026-01-01');
        expect(typeof formatted).toBe('string');
        expect(formatted.length).toBeGreaterThan(0);
      });

      it('hijriNumeric returns a yyyy-mm-dd style string if implemented', () => {
        if (!pack.academicCalendar?.hijriNumeric) return;
        const formatted = pack.academicCalendar.hijriNumeric('2026-01-01');
        expect(typeof formatted).toBe('string');
        expect(/\d{2,4}-\d{2}-\d{2}/.test(formatted)).toBe(true);
      });

      it('gregorianToHijri returns numeric year/month/day parts', () => {
        if (!pack.academicCalendar?.gregorianToHijri) return;
        const h = pack.academicCalendar.gregorianToHijri('2026-01-01') as {
          year: number;
          month: number;
          day: number;
        };
        expect(Number.isFinite(h.year)).toBe(true);
        expect(Number.isFinite(h.month)).toBe(true);
        expect(Number.isFinite(h.day)).toBe(true);
        expect(h.month).toBeGreaterThanOrEqual(1);
        expect(h.month).toBeLessThanOrEqual(12);
        expect(h.day).toBeGreaterThanOrEqual(1);
        expect(h.day).toBeLessThanOrEqual(30);
      });
    });

    describe('regulator reports', () => {
      it('calculateNitaqat returns a workforce composition with valid percentages', async () => {
        if (!pack.regulatorReports?.calculateNitaqat) return;
        const stub = makeDefaultStub();
        const employees = [
          { id: 'e1', status: 'active', is_saudi: true, gender: 'male', department_id: 'd1' },
          { id: 'e2', status: 'active', nationality: 'Indian', gender: 'female', department_id: 'd1' },
        ];
        const departments = [
          { id: 'd1', name_en: 'Admin', name_ar: 'إدارة' },
        ];
        const result = (await pack.regulatorReports.calculateNitaqat(stub.client, 'tenant-1', {
          employees,
          departments,
        })) as Record<string, unknown>;
        expect(typeof result.headcount).toBe('number');
        expect(typeof result.saudiCount).toBe('number');
        expect(typeof result.saudizationPct).toBe('number');
        expect((result.headcount as number)).toBeGreaterThanOrEqual(0);
        expect((result.saudiCount as number)).toBeGreaterThanOrEqual(0);
        expect((result.saudiCount as number) <= (result.headcount as number)).toBe(true);
        expect((result.saudizationPct as number) >= 0).toBe(true);
        expect((result.saudizationPct as number) <= 100).toBe(true);
        const band = result.nitaqatBand ?? (result.nitaqat as Record<string, unknown> | undefined)?.band;
        expect(['platinum', 'green', 'yellow', 'red', null]).toContain(band);
      });
    });

    describe('payments', () => {
      it('getOrCreatePaymentLink returns a PaymentLinkResult shape', async () => {
        if (!pack.payments?.getOrCreatePaymentLink) return;
        const stub = makeDefaultStub();
        const result = (await pack.payments.getOrCreatePaymentLink(stub.client, {
          tenantId: 'tenant-1',
          invoiceId: 'inv-1',
          callbackUrl: 'https://example.com/callback',
          sourceType: 'mada',
        })) as { ok: boolean; paymentUrl?: string; error?: string };
        expect(typeof result.ok).toBe('boolean');
        if (result.ok) expect(typeof result.paymentUrl).toBe('string');
        else expect(typeof result.error).toBe('string');
      });

      it('getOrCreatePaymentLink reuses an active existing link', async () => {
        if (!pack.payments?.getOrCreatePaymentLink) return;
        const stub = makeDefaultStub();
        stub.setResolver((ctx) => {
          if (ctx.table === 'moyasar_invoices') {
            return {
              data: {
                moyasar_id: 'moy-existing',
                payment_url: 'https://pay.existing/inv-1',
                status: 'initiated',
                expired_at: '2099-12-31T23:59:59Z',
                amount_minor: 115000,
              },
            };
          }
          return defaultResolver(ctx);
        });

        const result = (await pack.payments.getOrCreatePaymentLink(stub.client, {
          tenantId: 'tenant-1',
          invoiceId: 'inv-1',
          callbackUrl: 'https://example.com/callback',
          sourceType: 'mada',
        })) as { ok: boolean; paymentUrl?: string; error?: string };

        if (result.ok) {
          expect(result.paymentUrl).toBe('https://pay.existing/inv-1');
        } else {
          expect(result.error).toBe('moyasar_not_configured');
        }
      });

      it('createOrRefreshPaymentLink returns a PaymentLinkResult shape', async () => {
        if (!pack.payments?.createOrRefreshPaymentLink) return;
        const stub = makeDefaultStub();
        const result = (await pack.payments.createOrRefreshPaymentLink(stub.client, {
          tenantId: 'tenant-1',
          invoiceId: 'inv-1',
          callbackUrl: 'https://example.com/callback',
        })) as { ok: boolean; paymentUrl?: string; error?: string };
        expect(typeof result.ok).toBe('boolean');
        if (result.ok) expect(typeof result.paymentUrl).toBe('string');
        else expect(typeof result.error).toBe('string');
      });

      it('refundPayment returns a result with ok boolean', async () => {
        if (!pack.payments?.refundPayment) return;
        const result = (await pack.payments.refundPayment(
          makeDefaultStub().client,
          'tenant-1',
          'pmt-1',
          100,
        )) as { ok: boolean; error?: string };
        expect(typeof result.ok).toBe('boolean');
        if (!result.ok) expect(typeof result.error).toBe('string');
      });

      it('processWebhook returns a structured response', async () => {
        if (!pack.payments?.processWebhook) return;
        const result = (await pack.payments.processWebhook(
          makeDefaultStub().client,
          { id: 'evt-1', status: 'paid', amount: 1150 },
          'invalid-sig',
        )) as { received: boolean; error?: string };
        expect(typeof result).toBe('object');
        expect(typeof result.received).toBe('boolean');
      });

      it('reconcilePaymentState returns checked count and drift list', async () => {
        if (!pack.payments?.reconcilePaymentState) return;
        const result = (await pack.payments.reconcilePaymentState(
          makeDefaultStub().client,
          'tenant-1',
        )) as { checked: number; drift: unknown[] };
        expect(typeof result.checked).toBe('number');
        expect(Array.isArray(result.drift)).toBe(true);
      });

      it('generateSadadBill returns bill metadata if implemented', async () => {
        if (!pack.payments?.generateSadadBill) return;
        const stub = makeDefaultStub();
        const result = (await pack.payments.generateSadadBill(stub.client, 'tenant-1', 'inv-1')) as {
          sadad_bill_number: string;
          amount: number;
          due_date: string | null;
          payment_instructions: { ar: string; en: string };
        };
        expect(typeof result.sadad_bill_number).toBe('string');
        expect(typeof result.amount).toBe('number');
        expect(typeof result.payment_instructions).toBe('object');
        expect(typeof result.payment_instructions.ar).toBe('string');
        expect(typeof result.payment_instructions.en).toBe('string');
      });
    });

    describe('identity', () => {
      it('validateNationalId returns a boolean', () => {
        if (!pack.identity?.validateNationalId) return;
        expect(typeof pack.identity.validateNationalId('123')).toBe('boolean');
      });

      it('formatNationalId returns a string', () => {
        if (!pack.identity?.formatNationalId) return;
        expect(typeof pack.identity.formatNationalId('123')).toBe('string');
      });

      it('validateIban returns a boolean', () => {
        if (!pack.identity?.validateIban) return;
        expect(typeof pack.identity.validateIban('XX00')).toBe('boolean');
      });
    });
  },
);
