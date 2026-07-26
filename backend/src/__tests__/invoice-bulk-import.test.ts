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
});
