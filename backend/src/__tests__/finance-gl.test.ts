/**
 * Finance & General Ledger — journal posting integrity for the financial
 * close cycle (priority scenario #3: GL posting → statement generation).
 *
 * Double-entry accounting invariants verified:
 *   - Every posted entry has Σdebits == Σcredits (the trial-balance invariant)
 *   - Realistic multi-line postings balance (A/R = Revenue + VAT Payable)
 *   - Unbalanced entries are rejected before they ever hit the ledger
 *   - Audit-trail integrity: every entry & line is stamped with tenant_id,
 *     created_by, and status='posted'
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { journalEntryRouter } = await import('../routes/journalEntries.js');

const FINANCE_USER = { id: 'acc-1', email: 'cfo@school.sa', tenant_id: 'tenant-A', role: 'cfo', is_platform_owner: false };

function makeApp(user: Record<string, unknown> = FINANCE_USER) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/journal-entries', journalEntryRouter);
  return app;
}

// Echo the computed totals back so the trial-balance invariant can be asserted.
function ledgerResolver() {
  return (ctx: QueryContext) => {
    if (ctx.table === 'journal_entries' && ctx.op === 'insert') {
      const p = ctx.payload as { total_debit: number; total_credit: number };
      return { data: { id: 'je-1', total_debit: p.total_debit, total_credit: p.total_credit, status: 'posted' } };
    }
    return { data: null };
  };
}

beforeEach(() => {
  db.reset();
  db.setResolver(ledgerResolver());
  vi.clearAllMocks();
});

describe('POST /journal-entries — close-cycle postings', () => {
  it('posts a balanced invoice entry (A/R debit = Revenue + VAT credit)', async () => {
    const res = await request(makeApp())
      .post('/journal-entries')
      .send({
        date: '2026-06-30',
        reference: 'INV-2026-000001',
        description: 'Tuition invoice — June close',
        lines: [
          { account_id: 'acc-ar',      debit: 1150, credit: 0,    description: 'Accounts Receivable' },
          { account_id: 'acc-revenue', debit: 0,    credit: 1000, description: 'Tuition Revenue' },
          { account_id: 'acc-vat',     debit: 0,    credit: 150,  description: 'VAT Payable 15%' },
        ],
      });

    expect(res.status).toBe(201);
    // Trial-balance invariant: total debits equal total credits.
    expect(res.body.total_debit).toBe(1150);
    expect(res.body.total_credit).toBe(1150);
    expect(res.body.total_debit).toBe(res.body.total_credit);
  });

  it('posts a balanced payment entry (Cash debit = A/R credit)', async () => {
    const res = await request(makeApp())
      .post('/journal-entries')
      .send({
        date: '2026-06-30',
        reference: 'PMT-0001',
        description: 'Payment received',
        lines: [
          { account_id: 'acc-cash', debit: 1150, credit: 0 },
          { account_id: 'acc-ar',   debit: 0,    credit: 1150 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.total_debit).toBe(res.body.total_credit);
  });

  it('rejects an unbalanced entry before it reaches the ledger (400)', async () => {
    const res = await request(makeApp())
      .post('/journal-entries')
      .send({
        date: '2026-06-30',
        description: 'Unbalanced — VAT omitted',
        lines: [
          { account_id: 'acc-ar',      debit: 1150, credit: 0 },
          { account_id: 'acc-revenue', debit: 0,    credit: 1000 }, // 150 short
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Debits.*must equal credits/i);
    // Nothing should have been written to the ledger.
    expect(db.filtersFor('journal_entries').length).toBe(0);
  });

  it('stamps the entry with tenant_id, created_by and status=posted (audit trail)', async () => {
    await request(makeApp())
      .post('/journal-entries')
      .send({
        date: '2026-06-30',
        description: 'Audit stamp check',
        lines: [
          { account_id: 'a', debit: 500, credit: 0 },
          { account_id: 'b', debit: 0,   credit: 500 },
        ],
      });

    const entryInsert = db.filtersFor('journal_entries').find((c) => c.op === 'insert');
    const payload = entryInsert?.payload as Record<string, unknown>;
    expect(payload.tenant_id).toBe('tenant-A');
    expect(payload.created_by).toBe('acc-1');
    expect(payload.status).toBe('posted');

    // Every ledger line must also carry the tenant_id (cross-tenant safety).
    const lineInsert = db.filtersFor('journal_entry_lines').find((c) => c.op === 'insert');
    const lines = lineInsert?.payload as Array<Record<string, unknown>>;
    expect(lines.every((l) => l.tenant_id === 'tenant-A')).toBe(true);
  });

  it('denies a non-finance role from posting to the ledger (403)', async () => {
    const res = await request(makeApp({ ...FINANCE_USER, role: 'teacher' }))
      .post('/journal-entries')
      .send({ date: '2026-06-30', description: 'x', lines: [
        { account_id: 'a', debit: 1, credit: 0 },
        { account_id: 'b', debit: 0, credit: 1 },
      ] });
    expect(res.status).toBe(403);
  });
});
