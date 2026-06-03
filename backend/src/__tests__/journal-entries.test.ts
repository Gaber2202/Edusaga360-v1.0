import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock @supabase/supabase-js ────────────────────────────────────────────────
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

// Import AFTER mocks are registered
const { journalEntryRouter } = await import('../routes/journalEntries.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  // Inject a fake authenticated user so the route doesn't crash on req.user
  app.use((req: express.Request & { user?: unknown }, _res, next) => {
    req.user = { id: 'user-1', email: 'acc@school.sa', tenant_id: 'tenant-x' };
    next();
  });
  app.use('/journal-entries', journalEntryRouter);
  return app;
}

function makeQB(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
  const qb = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
  };
  return qb;
}

// Balanced lines helper
function balancedLines() {
  return [
    { account_id: 'acc-1', debit: 1000, credit: 0 },
    { account_id: 'acc-2', debit: 0, credit: 1000 },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /journal-entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 when entry is balanced', async () => {
    const entryQB = makeQB({ data: { id: 'je-1', total_debit: 1000, total_credit: 1000 }, error: null });
    const linesQB = makeQB({ data: [], error: null });

    mockFrom
      .mockReturnValueOnce(entryQB)  // journal_entries insert
      .mockReturnValueOnce(linesQB); // journal_entry_lines insert

    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-01-15',
        description: 'School fee collection',
        lines: balancedLines(),
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('je-1');
  });

  it('returns 400 when debits do not equal credits (unbalanced entry)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-01-15',
        description: 'Unbalanced entry',
        lines: [
          { account_id: 'acc-1', debit: 500, credit: 0 },
          { account_id: 'acc-2', debit: 0, credit: 300 }, // 500 ≠ 300
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/debits.*credits|credits.*debits/i);
  });

  it('returns 400 when lines array has fewer than 2 entries', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-01-15',
        description: 'Single line only',
        lines: [{ account_id: 'acc-1', debit: 100, credit: 0 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when lines array is empty', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-01-15',
        description: 'Empty lines',
        lines: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when required description field is missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-01-15',
        // description is missing
        lines: balancedLines(),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when required date field is missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        // date is missing
        description: 'Missing date',
        lines: balancedLines(),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('accepts entry with optional reference and cost_center_id fields', async () => {
    const entryQB = makeQB({ data: { id: 'je-2', total_debit: 500, total_credit: 500 }, error: null });
    const linesQB = makeQB({ data: [], error: null });

    mockFrom
      .mockReturnValueOnce(entryQB)
      .mockReturnValueOnce(linesQB);

    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-02-01',
        reference: 'REF-001',
        description: 'With optional fields',
        lines: [
          { account_id: 'acc-1', debit: 500, credit: 0, cost_center_id: 'cc-1', description: 'Debit line' },
          { account_id: 'acc-2', debit: 0, credit: 500, cost_center_id: 'cc-2', description: 'Credit line' },
        ],
      });

    expect(res.status).toBe(201);
  });

  it('accepts entry where debit and credit differ by less than 0.01 (floating point tolerance)', async () => {
    const entryQB = makeQB({ data: { id: 'je-3' }, error: null });
    const linesQB = makeQB({ data: [], error: null });

    mockFrom
      .mockReturnValueOnce(entryQB)
      .mockReturnValueOnce(linesQB);

    const app = makeApp();
    const res = await request(app)
      .post('/journal-entries')
      .send({
        date: '2025-02-01',
        description: 'Floating point safe',
        lines: [
          { account_id: 'acc-1', debit: 1000.004, credit: 0 },
          { account_id: 'acc-2', debit: 0, credit: 1000.000 }, // diff = 0.004 < 0.01
        ],
      });

    expect(res.status).toBe(201);
  });
});
