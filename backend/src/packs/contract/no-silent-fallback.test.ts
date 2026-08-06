import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }));

import { resolvePack } from '../registry.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';

function assertThrowsNotImplemented(fn: () => unknown | Promise<unknown>) {
  return expect(async () => {
    const result = fn();
    if (result && typeof result === 'object' && 'then' in result && typeof (result as { then?: unknown }).then === 'function') {
      await result;
    }
  }).rejects.toThrow(NotImplementedInJurisdiction);
}

describe('no silent fallback', () => {
  it('throws NotImplementedInJurisdiction for an unregistered jurisdiction', () => {
    const ctx = { tenant: { id: 'tenant-1', jurisdictionCode: 'XX' } };
    expect(() => resolvePack(ctx)).toThrow(NotImplementedInJurisdiction);
  });

  it('does not return Saudi behaviour for an unregistered jurisdiction', () => {
    const ctx = { tenant: { id: 'tenant-1', jurisdictionCode: 'XX' } };
    let threw = false;
    try {
      resolvePack(ctx);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(NotImplementedInJurisdiction);
      // Ensure the error names the missing jurisdiction, not Saudi Arabia.
      expect((err as NotImplementedInJurisdiction).jurisdiction).toBe('XX');
    }
    expect(threw).toBe(true);
  });

  describe('AE stubs throw NotImplementedInJurisdiction', () => {
    const ctx = { tenant: { id: 'tenant-ae', jurisdictionCode: 'AE' } };
    const pack = resolvePack(ctx);

    it('EInvoiceService.generateUBLXml', () => assertThrowsNotImplemented(() => pack.eInvoice?.generateUBLXml?.({}, {})));
    it('EInvoiceService.generateInvoiceHash', () => assertThrowsNotImplemented(() => pack.eInvoice?.generateInvoiceHash?.('<xml/>')));
    it('EInvoiceService.generateTLVQR', () => assertThrowsNotImplemented(() => pack.eInvoice?.generateTLVQR?.({}, {}, 'sig')));
    it('EInvoiceService.buildInvoiceHTML', () => assertThrowsNotImplemented(() => pack.eInvoice?.buildInvoiceHTML?.({}, {}, 'qr')));
    it('EInvoiceService.generatePDF', () => assertThrowsNotImplemented(() => pack.eInvoice?.generatePDF?.({}, {})));

    it('DocumentsService.renderInvoicePdf', () => assertThrowsNotImplemented(() => pack.documents?.renderInvoicePdf?.({}, {})));
    it('DocumentsService.renderPayslipPdf', () => assertThrowsNotImplemented(() => pack.documents?.renderPayslipPdf?.({})));

    it('RegulatorReportsService.calculateNitaqat', () => assertThrowsNotImplemented(() => pack.regulatorReports?.calculateNitaqat?.({}, 'tenant-ae')));
    it('RegulatorReportsService.calculateVatReturn', () => assertThrowsNotImplemented(() => pack.regulatorReports?.calculateVatReturn?.({}, { start: '2026-01-01', end: '2026-03-31' })));
    it('RegulatorReportsService.generateMHRSDReport', () => assertThrowsNotImplemented(() => pack.regulatorReports?.generateMHRSDReport?.({}, 'tenant-ae')));

    it('PaymentsService.getOrCreatePaymentLink', () => assertThrowsNotImplemented(() => pack.payments?.getOrCreatePaymentLink?.({}, {
      tenantId: 'tenant-ae', invoiceId: 'inv-ae', callbackUrl: 'https://school.ae/cb',
    })));
    it('PaymentsService.createOrRefreshPaymentLink', () => assertThrowsNotImplemented(() => pack.payments?.createOrRefreshPaymentLink?.({}, {
      tenantId: 'tenant-ae', invoiceId: 'inv-ae', callbackUrl: 'https://school.ae/cb',
    })));
    it('PaymentsService.processWebhook', () => assertThrowsNotImplemented(() => pack.payments?.processWebhook?.({}, {})));
    it('PaymentsService.refundPayment', () => assertThrowsNotImplemented(() => pack.payments?.refundPayment?.({}, 'tenant-ae', 'pay-ae')));
    it('PaymentsService.generateSadadBill', () => assertThrowsNotImplemented(() => pack.payments?.generateSadadBill?.({}, 'tenant-ae', 'inv-ae')));
    it('PaymentsService.reconcilePaymentState', () => assertThrowsNotImplemented(() => pack.payments?.reconcilePaymentState?.({}, 'tenant-ae')));

    it('PayrollService.calculateGosi', () => assertThrowsNotImplemented(() => pack.payroll?.calculateGosi?.(10000, 'any')));
    it('PayrollService.calculatePayroll', () => assertThrowsNotImplemented(() => pack.payroll?.calculatePayroll?.({}, 'tenant-ae', { start: '2026-01-01', end: '2026-01-31' })));
    it('PayrollService.generateWpsFile', () => assertThrowsNotImplemented(() => pack.payroll?.generateWpsFile?.({}, 'tenant-ae', { start: '2026-01-01', end: '2026-01-31' })));

    it('AcademicCalendarService.formatHijri', () => assertThrowsNotImplemented(() => pack.academicCalendar?.formatHijri?.('2026-01-01')));
    it('AcademicCalendarService.gregorianToHijri', () => assertThrowsNotImplemented(() => pack.academicCalendar?.gregorianToHijri?.('2026-01-01')));
    it('AcademicCalendarService.hijriToGregorian', () => assertThrowsNotImplemented(() => pack.academicCalendar?.hijriToGregorian?.(1446, 9, 1)));
    it('AcademicCalendarService.hijriNumeric', () => assertThrowsNotImplemented(() => pack.academicCalendar?.hijriNumeric?.('2026-01-01')));
  });
});
