import { describe, it, expect } from 'vitest';
import { csvToRows, processBulkImport } from '../services/bulkImport.js';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

describe('csvToRows', () => {
  it('parses a simple CSV with quoted fields', () => {
    const csv = 'name_en,name_ar\nAhmed,"أحمد"\n"Sara, Jr",سارة';
    const rows = csvToRows(csv);
    expect(rows).toEqual([
      { name_en: 'Ahmed', name_ar: 'أحمد' },
      { name_en: 'Sara, Jr', name_ar: 'سارة' },
    ]);
  });
});

describe('processBulkImport', () => {
  it('validates student rows and returns error for missing name', async () => {
    const db = createSupabaseStub();
    db.setResolver(() => ({ data: {} }));
    const result = await processBulkImport(
      db.client as any,
      'tenant-1',
      'students',
      [{ name_ar: 'أحمد' }],
      { name_en: 'name_en', name_ar: 'name_ar' },
      true,
    );
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors).toContain('name_en is required');
  });

  it('imports valid fee categories on dry_run=false', async () => {
    const db = createSupabaseStub();
    let inserted: any = null;
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'fee_categories' && ctx.op === 'insert') {
        inserted = ctx.payload;
        return { data: { id: 'fc-1' } };
      }
      return { data: null };
    });

    const result = await processBulkImport(
      db.client as any,
      'tenant-1',
      'fee_categories',
      [{ code: 'TUITION', name_en: 'Tuition', name_ar: 'رسوم دراسية' }],
      { code: 'code', name_en: 'name_en', name_ar: 'name_ar' },
      false,
    );

    expect(result.valid).toBe(1);
    expect(result.created).toBe(1);
    expect(inserted.code).toBe('TUITION');
    expect(inserted.vat_treatment).toBe('standard');
  });

  it('applies a full payment through bulk import without writing invoices.balance', async () => {
    const db = createSupabaseStub();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') {
        return { data: { id: 'inv-1', total_amount: 1150, paid_amount: 0, status: 'issued' } };
      }
      if (ctx.table === 'payments' && ctx.op === 'insert') {
        return { data: { id: 'pmt-1' } };
      }
      if (ctx.table === 'invoices' && ctx.op === 'update') {
        return { data: [{ id: 'inv-1', total_amount: 1150, paid_amount: 1150, status: 'paid' }] };
      }
      return { data: null };
    });

    const result = await processBulkImport(
      db.client as any,
      'tenant-1',
      'payments',
      [{ invoice_number: 'INV-2026-000001', amount: 1150, payment_method: 'cash', date: '2026-08-01' }],
      { invoice_number: 'invoice_number', amount: 'amount', payment_method: 'payment_method', date: 'date' },
      false,
    );

    expect(result.valid).toBe(1);
    expect(result.created).toBe(1);

    const update = db.filtersFor('invoices').find((c) => c.op === 'update');
    expect(update).toBeTruthy();
    const payload = update!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('balance');
    expect(payload.paid_amount).toBe(1150);
    expect(payload.status).toBe('paid');
    // Generated invoices.balance would be total - paid = 0.
    expect(1150 - (payload.paid_amount as number)).toBe(0);
  });

  it('creates an invoice through bulk import without writing invoices.balance', async () => {
    const db = createSupabaseStub();
    let inserted: any = null;
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'students' && ctx.op === 'select') return { data: { id: 's1' } };
      if (ctx.table === 'invoices' && ctx.op === 'insert') {
        inserted = ctx.payload;
        return { data: { id: 'inv-1', ...(ctx.payload as object) } };
      }
      return { data: null };
    });

    const result = await processBulkImport(
      db.client as any,
      'tenant-1',
      'invoices',
      [{ student_number: 'S001', academic_year: '2025-2026', invoice_number: 'INV-2026-B001', total_amount: 1150, paid_amount: 1150, status: 'paid' }],
      { student_number: 'student_number', academic_year: 'academic_year', invoice_number: 'invoice_number', total_amount: 'total_amount', paid_amount: 'paid_amount', status: 'status' },
      false,
    );

    expect(result.valid).toBe(1);
    expect(result.created).toBe(1);
    expect(inserted).toBeTruthy();
    expect(inserted).not.toHaveProperty('balance');
    expect(inserted.paid_amount).toBe(1150);
    expect(inserted.total_amount).toBe(1150);
    // Generated invoices.balance would be 0 for a fully-paid invoice.
    expect((inserted.total_amount as number) - (inserted.paid_amount as number)).toBe(0);
  });
});
