import type { SupabaseClient } from '@supabase/supabase-js';

export interface BulkImportRow {
  [key: string]: string | number | undefined;
}

export interface BulkImportResult {
  resource: string;
  dry_run: boolean;
  valid: number;
  invalid: number;
  created: number;
  rows: { input: BulkImportRow; errors?: string[]; record?: any }[];
}

function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function csvToRows(csv: string, delimiter = ','): BulkImportRow[] {
  const parsed = parseCsv(csv, delimiter);
  if (parsed.length === 0) return [];
  const headers = parsed[0].map((h) => h.trim());
  return parsed.slice(1).map((row) => {
    const obj: BulkImportRow = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx]?.trim() ?? '';
      if (obj[h] === '') obj[h] = undefined;
    });
    return obj;
  });
}

function val(row: BulkImportRow, mapping: Record<string, string>, key: string): string | undefined {
  const header = mapping[key];
  if (!header) return undefined;
  const v = row[header];
  return typeof v === 'string' ? v.trim() : v?.toString();
}

function num(row: BulkImportRow, mapping: Record<string, string>, key: string): number | undefined {
  const v = val(row, mapping, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function dateVal(row: BulkImportRow, mapping: Record<string, string>, key: string): string | undefined {
  const v = val(row, mapping, key);
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return v;
}

export async function processBulkImport(
  supabase: SupabaseClient,
  tenantId: string,
  resource: string,
  rows: BulkImportRow[],
  mapping: Record<string, string>,
  dryRun = false,
): Promise<BulkImportResult> {
  const result: BulkImportResult = { resource, dry_run: dryRun, valid: 0, invalid: 0, created: 0, rows: [] };

  for (const row of rows) {
    const errors: string[] = [];
    let record: any;

    try {
      if (resource === 'students') {
        const name_en = val(row, mapping, 'name_en');
        const name_ar = val(row, mapping, 'name_ar');
        const grade = val(row, mapping, 'grade');
        if (!name_en) errors.push('name_en is required');

        if (errors.length === 0) {
          const insert = { tenant_id: tenantId, name_en, name_ar, grade, status: 'active' };
          if (!dryRun) {
            const { data, error } = await supabase.from('students').insert(insert).select().single();
            if (error) errors.push(error.message);
            else record = data;
          } else {
            record = insert;
          }
        }
      } else if (resource === 'guardians') {
        const name_en = val(row, mapping, 'name_en');
        const name_ar = val(row, mapping, 'name_ar');
        const email = val(row, mapping, 'email');
        const phone = val(row, mapping, 'phone');
        if (!name_en) errors.push('name_en is required');
        if (email && !email.includes('@')) errors.push('invalid email');

        if (errors.length === 0) {
          const insert = { tenant_id: tenantId, name_en, name_ar, email, phone };
          if (!dryRun) {
            const { data, error } = await supabase.from('guardians').insert(insert).select().single();
            if (error) errors.push(error.message);
            else record = data;
          } else {
            record = insert;
          }
        }
      } else if (resource === 'fee_categories') {
        const code = val(row, mapping, 'code');
        const name_en = val(row, mapping, 'name_en');
        const name_ar = val(row, mapping, 'name_ar');
        const vat_treatment = val(row, mapping, 'vat_treatment') || 'standard';
        if (!code) errors.push('code is required');
        if (!name_en || !name_ar) errors.push('name_en and name_ar are required');
        if (!['standard', 'exempt', 'zero_rated', 'out_of_scope'].includes(vat_treatment)) errors.push('invalid vat_treatment');

        if (errors.length === 0) {
          const insert = { tenant_id: tenantId, code, name_en, name_ar, vat_treatment, gl_revenue_code: val(row, mapping, 'gl_revenue_code') };
          if (!dryRun) {
            const { data, error } = await supabase.from('fee_categories').insert(insert).select().single();
            if (error) errors.push(error.message);
            else record = data;
          } else {
            record = insert;
          }
        }
      } else if (resource === 'invoices') {
        const student_number = val(row, mapping, 'student_number');
        const academic_year = val(row, mapping, 'academic_year');
        const invoice_number = val(row, mapping, 'invoice_number');
        const date = dateVal(row, mapping, 'date');
        const due_date = dateVal(row, mapping, 'due_date');
        const total_amount = num(row, mapping, 'total_amount');
        const paid_amount = num(row, mapping, 'paid_amount') || 0;
        const status = val(row, mapping, 'status') || 'issued';

        if (!student_number) errors.push('student_number is required');
        if (!academic_year) errors.push('academic_year is required');
        if (total_amount === undefined) errors.push('total_amount is required');

        let studentId: string | undefined;
        if (student_number) {
          const { data } = await supabase.from('students').select('id').eq('tenant_id', tenantId).eq('student_id', student_number).maybeSingle();
          if (!data) errors.push(`student_number not found: ${student_number}`);
          else studentId = (data as any).id;
        }

        if (errors.length === 0 && studentId) {
          const insert = {
            tenant_id: tenantId,
            student_id: studentId,
            invoice_number,
            academic_year,
            date: date || new Date().toISOString().split('T')[0],
            due_date: due_date ?? null,
            total_amount,
            paid_amount,
            status,
            document_type: 'invoice',
            invoice_type: 'simplified',
            zatca_invoice_type: 'simplified',
            subtotal: total_amount,
            vat_amount: 0,
            items: [{ description_en: 'Imported invoice', description_ar: 'فاتورة مستوردة', amount: total_amount, quantity: 1, vat_rate: 0, vat_amount: 0, subtotal: total_amount, total: total_amount }],
          };
          if (!dryRun) {
            const { data, error } = await supabase.from('invoices').insert(insert).select().single();
            if (error) errors.push(error.message);
            else record = data;
          } else {
            record = insert;
          }
        }
      } else if (resource === 'payments') {
        const invoice_number = val(row, mapping, 'invoice_number');
        const amount = num(row, mapping, 'amount');
        const date = dateVal(row, mapping, 'date');
        const payment_method = val(row, mapping, 'payment_method') || 'cash';

        if (!invoice_number) errors.push('invoice_number is required');
        if (amount === undefined) errors.push('amount is required');

        let invoice: any;
        if (invoice_number) {
          const { data } = await supabase.from('invoices').select('id, total_amount, paid_amount, status, balance').eq('tenant_id', tenantId).eq('invoice_number', invoice_number).maybeSingle();
          if (!data) errors.push(`invoice_number not found: ${invoice_number}`);
          else invoice = data;
        }

        if (errors.length === 0 && invoice && amount !== undefined) {
          const newPaid = (Number(invoice.paid_amount) || 0) + amount;
          const newStatus = newPaid >= (Number(invoice.total_amount) || 0) ? 'paid' : 'partial';
          const insert = { tenant_id: tenantId, invoice_id: invoice.id, amount, date: date || new Date().toISOString().split('T')[0], payment_method, reference: val(row, mapping, 'reference') };
          if (!dryRun) {
            const { data, error } = await supabase.from('payments').insert(insert).select().single();
            if (error) errors.push(error.message);
            else {
              await supabase.from('invoices').update({ paid_amount: newPaid, status: newStatus }).eq('id', invoice.id);
              record = data;
            }
          } else {
            record = insert;
          }
        }
      } else {
        errors.push(`Unsupported resource: ${resource}`);
      }
    } catch (err) {
      errors.push((err as Error).message);
    }

    if (errors.length > 0) {
      result.invalid++;
      result.rows.push({ input: row, errors });
    } else {
      result.valid++;
      result.created += dryRun ? 0 : 1;
      result.rows.push({ input: row, record });
    }
  }

  return result;
}
