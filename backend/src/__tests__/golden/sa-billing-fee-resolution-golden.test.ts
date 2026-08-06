/**
 * Golden-file test for the billing fee-resolution -> discount -> VAT line path.
 *
 * Pins the current output of routes/billing.ts so the 4.6d refactor cannot
 * silently change:
 *   - fee-structure resolution and mapping
 *   - VAT treatment -> rate / category code enrichment
 *   - discount redistribution across lines
 *   - invoice totals
 *   - bulk dry-run estimate vs actual invoice total
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from '../support/supabaseMock.js';
import { golden } from './support/golden.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { billingRouter } = await import('../../routes/billing.js');

const TENANT_ID = 'tenant-A';
const FINANCE_USER = { id: 'u1', email: 'fin@school.sa', tenant_id: TENANT_ID, role: 'admin', is_platform_owner: false };

function makeApp(user = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/billing', billingRouter);
  return app;
}

beforeAll(() => {
  process.env.TZ = 'UTC';
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date('2026-06-18T00:00:00Z'));
});

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

const STUDENT = { id: 'student-1', name_en: 'Ahmad', name_ar: 'أحمد', grade_id: 'grade-g1', branch_id: 'branch-b1', guardian_id: null, grades: { name_en: 'Grade 1' } };

const TENANT = {
  id: TENANT_ID,
  name_en: 'Al Noor School',
  name_ar: 'مدرسة النور',
  admin_email: 'admin@alnoor.edu.sa',
  city: 'Riyadh',
  logo_url: null,
  jurisdiction_code: 'SA',
  settings: {},
};

const CAMPUS_B1 = '11111111-1111-1111-1111-111111111111';
const CAMPUS_B2 = '22222222-2222-2222-2222-222222222222';

const CATEGORIES = {
  standard: { id: 'cat-standard', vat_treatment: 'standard', name_en: 'Tuition', name_ar: 'رسوم دراسية', code: 'TUI' },
  zero: { id: 'cat-zero', vat_treatment: 'zero_rated', name_en: 'Uniforms', name_ar: 'زي مدرسي', code: 'UNI' },
  exempt: { id: 'cat-exempt', vat_treatment: 'exempt', name_en: 'Books', name_ar: 'كتب', code: 'BK' },
  out: { id: 'cat-out', vat_treatment: 'out_of_scope', name_en: 'Trip', name_ar: 'رحلة', code: 'TRIP' },
};

function applyFeeStructureFilters(rows: Record<string, unknown>[], filters: QueryContext['filters']) {
  const orFilters = filters.filter((f) => f.method === 'or');
  if (orFilters.length === 0) return rows;
  return rows.filter((row) => {
    for (const orFilter of orFilters) {
      const str = orFilter.args[0] as string;
      const parts = str.split(',');
      const passes = parts.some((part) => {
        const [col, op, val] = part.split('.');
        if (op === 'eq' && row[col] === val) return true;
        if (op === 'is' && val === 'null' && (row[col] === null || row[col] === undefined)) return true;
        return false;
      });
      if (!passes) return false;
    }
    return true;
  });
}

function applyEqFilters(rows: Record<string, unknown>[], filters: QueryContext['filters']) {
  const eqFilters = filters.filter((f) => f.method === 'eq');
  return rows.filter((row) => eqFilters.every((f) => {
    if (f.args[0] === 'tenant_id') return true;
    if (f.args[0] === 'status') return true;
    return row[f.args[0] as string] === f.args[1];
  }));
}

function buildResolver(opts: {
  feeStructures: Record<string, unknown>[];
  discountRules?: Record<string, unknown>[];
  students?: Record<string, unknown>[];
  tenant?: Record<string, unknown>;
  categories?: Record<string, unknown>[];
}) {
  const feeStructures = opts.feeStructures;
  const discountRules = opts.discountRules ?? [];
  const students = opts.students ?? [STUDENT];
  const tenant = opts.tenant ?? TENANT;
  const categories = opts.categories ?? Object.values(CATEGORIES);

  return (ctx: QueryContext) => {
    if (ctx.table === 'tenants') {
      return { data: tenant };
    }
    if (ctx.table === 'tenant_compliance_settings') {
      return { data: null };
    }
    if (ctx.table === 'branches') {
      return { data: { id: 'branch-b1', jurisdiction_code: 'SA' } };
    }
    if (ctx.table === 'fee_structures') {
      return { data: applyFeeStructureFilters(feeStructures, ctx.filters) };
    }
    if (ctx.table === 'fee_categories') {
      return { data: categories };
    }
    if (ctx.table === 'students') {
      if (ctx.head) return { count: 0 };
      if (ctx.single) return { data: students[0] ?? null };
      return { data: applyEqFilters(students, ctx.filters) };
    }
    if (ctx.table === 'discount_rules') {
      return { data: discountRules };
    }
    if (ctx.table === 'invoices') {
      if (ctx.head) return { count: 0 };
      if (ctx.op === 'select') return { data: [] };
      if (ctx.op === 'insert') {
        const payload = ctx.payload as Record<string, unknown> | undefined;
        return { data: { ...(payload ?? {}), id: 'invoice-test-1' } };
      }
      if (ctx.op === 'update') {
        const payload = ctx.payload as Record<string, unknown> | undefined;
        return { data: { ...(payload ?? {}), id: 'invoice-test-1' } };
      }
      return { data: null };
    }
    if (ctx.table === 'zatca_submissions') {
      if (ctx.count) return { data: [], count: 0 };
      if (ctx.op === 'insert') return { data: { id: 'zatca-test-1' } };
      return { data: null };
    }
    if (ctx.table === 'invoice_discounts') {
      return { data: [] };
    }
    if (ctx.table === 'invoice_batches') {
      if (ctx.op === 'insert') {
        const payload = ctx.payload as Record<string, unknown> | undefined;
        return { data: { ...(payload ?? {}), id: 'batch-test-1' } };
      }
      if (ctx.op === 'update') {
        const payload = ctx.payload as Record<string, unknown> | undefined;
        return { data: { ...(payload ?? {}), id: 'batch-test-1' } };
      }
      return { data: null };
    }
    if (ctx.table === 'tenant_webhooks' || ctx.table === 'webhook_deliveries') {
      return { data: [] };
    }
    return { data: null };
  };
}

function extractInvoicePayload(calls: QueryContext[]) {
  const insert = [...calls].reverse().find((c) => c.table === 'invoices' && c.op === 'insert');
  return (insert?.payload as Record<string, unknown> | undefined) ?? null;
}

function summarizeInvoice(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  const items = (payload.items as Record<string, unknown>[] | undefined) ?? [];
  const summary = {
    subtotal: payload.subtotal,
    discount_amount: payload.discount_amount,
    vat_amount: payload.vat_amount,
    total_amount: payload.total_amount,
  };
  const lineSummary = items.map((item) => ({
    category_id: item.category_id,
    category_code: item.category_code,
    description_en: item.description_en,
    description_ar: item.description_ar,
    vat_treatment: item.vat_treatment,
    vat_category: item.vat_category,
    vat_category_code: item.vat_category_code,
    quantity: item.quantity,
    unit_amount: item.unit_amount,
    subtotal: item.subtotal,
    vat_rate: item.vat_rate,
    vat_amount: item.vat_amount,
    total: item.total,
    discount: item.discount,
  }));

  const redistributedDiscount = items.reduce((sum, item) => {
    const net = Number((item.total as number) ?? 0) - Number((item.vat_amount as number) ?? 0);
    return sum + (Number((item.subtotal as number) ?? 0) - net);
  }, 0);

  return {
    summary,
    items: lineSummary,
    redistributed_discount: Number(redistributedDiscount.toFixed(2)),
    redistributed_discount_matches_discount_amount: Number(redistributedDiscount.toFixed(2)) === Number(payload.discount_amount),
  };
}

async function runBulkApproved(body: Record<string, unknown>) {
  const app = makeApp();
  const res = await request(app).post('/billing/bulk-invoices').send({ ...body, approved: true });
  const invoicePayload = extractInvoicePayload(db.calls);
  return { res, invoicePayload };
}

async function runBulkDryRun(body: Record<string, unknown>) {
  const app = makeApp();
  const res = await request(app).post('/billing/bulk-invoices').send({ ...body, dry_run: true });
  return res;
}

describe('billing fee-resolution golden snapshot', () => {
  it('pins the full fee-resolution -> discount -> VAT path', async () => {
    // Case A: all four VAT treatments
    const caseAFeeStructures = [
      { id: 'fs-std', grade: null, campus_id: null, amount: 1000, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-zero', grade: null, campus_id: null, amount: 300, category_id: CATEGORIES.zero.id, fee_categories: CATEGORIES.zero },
      { id: 'fs-exempt', grade: null, campus_id: null, amount: 200, category_id: CATEGORIES.exempt.id, fee_categories: CATEGORIES.exempt },
      { id: 'fs-out', grade: null, campus_id: null, amount: 150, category_id: CATEGORIES.out.id, fee_categories: CATEGORIES.out },
    ];
    db.setResolver(buildResolver({ feeStructures: caseAFeeStructures }));
    const caseA = await runBulkApproved({ academic_year: '2026-2027' });

    // Case B: uneven discount (fixed SAR 100 off SAR 3,000 / 3 lines)
    const caseBFeeStructures = [
      { id: 'fs-b1', grade: null, campus_id: null, amount: 1000, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-b2', grade: null, campus_id: null, amount: 1000, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-b3', grade: null, campus_id: null, amount: 1000, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
    ];
    const discount100 = {
      id: 'rule-100',
      code: 'DISC100',
      name_en: 'Fixed 100 discount',
      name_ar: 'خصم 100 ثابت',
      discount_type: 'manual',
      calculation: 'fixed',
      value: 100,
      max_amount: null,
      applies_to: 'all',
      academic_year: null,
      is_active: true,
      priority: 1,
      stacking: 'blocked',
    };
    db.setResolver(buildResolver({ feeStructures: caseBFeeStructures, discountRules: [discount100] }));
    const caseB = await runBulkApproved({ academic_year: '2026-2027' });

    // Case C: grade-specific and null-grade together
    const caseCFeeStructures = [
      { id: 'fs-c-null', grade: null, campus_id: null, amount: 800, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-c-grade', grade: 'grade-g1', campus_id: null, amount: 500, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-c-other', grade: 'grade-g2', campus_id: null, amount: 999, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
    ];
    db.setResolver(buildResolver({ feeStructures: caseCFeeStructures }));
    const caseC = await runBulkApproved({ academic_year: '2026-2027' });

    // Case D: campus-specific and null-campus together
    const caseDStudent = { ...STUDENT, branch_id: CAMPUS_B1 };
    const caseDFeeStructures = [
      { id: 'fs-d-null', grade: null, campus_id: null, amount: 700, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-d-campus', grade: null, campus_id: CAMPUS_B1, amount: 400, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
      { id: 'fs-d-other', grade: null, campus_id: CAMPUS_B2, amount: 999, category_id: CATEGORIES.standard.id, fee_categories: CATEGORIES.standard },
    ];
    db.setResolver(buildResolver({ feeStructures: caseDFeeStructures, students: [caseDStudent] }));
    const caseD = await runBulkApproved({ academic_year: '2026-2027', campus_id: CAMPUS_B1 });

    // Case E: bulk dry-run estimate vs actual invoice total (same input as case B)
    db.setResolver(buildResolver({ feeStructures: caseBFeeStructures, discountRules: [discount100] }));
    const dryRun = await runBulkDryRun({ academic_year: '2026-2027' });
    const caseEApproved = await runBulkApproved({ academic_year: '2026-2027' });

    const snapshot = {
      case_a_all_vat_treatments: summarizeInvoice(caseA.invoicePayload),
      case_b_uneven_discount: summarizeInvoice(caseB.invoicePayload),
      case_c_grade_specific_and_null: summarizeInvoice(caseC.invoicePayload),
      case_d_campus_specific_and_null: summarizeInvoice(caseD.invoicePayload),
      case_e_bulk_estimate_vs_actual: {
        estimated_total: dryRun.body.estimated_total,
        actual_total: (caseEApproved.invoicePayload as Record<string, unknown> | null)?.total_amount ?? caseEApproved.res.body.totals?.total_amount,
        response_actual_total: caseEApproved.res.body.totals?.total_amount,
      },
    };

    golden('sa-billing-fee-resolution', JSON.stringify(snapshot, null, 2), 'json');
  });
});
