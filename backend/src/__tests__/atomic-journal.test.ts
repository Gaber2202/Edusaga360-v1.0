/**
 * Atomic journal posting — the ledger service must post double-entry through the
 * single `post_journal` Postgres function so the header and lines are written in
 * one transaction. This guards against the previous two-round-trip pattern that
 * could orphan a journal_entries header with no lines (an unbalanced GL).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseStub } from './support/supabaseMock.js';
import { makeLedger } from '../services/ledger.js';

const db = createSupabaseStub();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { postJournal } = makeLedger(db.client as any);

beforeEach(() => db.reset());

describe('makeLedger().postJournal', () => {
  const LINES = [
    { account_code: '11', debit: 1150, credit: 0, description: 'Cash' },
    { account_code: '12', debit: 0, credit: 1150, description: 'A/R' },
  ];

  it('posts via a single post_journal RPC (atomic), not raw table inserts', async () => {
    await postJournal('tenant-A', 'user-1', 'CHQ-001', 'Cheque cleared', LINES);

    // Exactly one atomic call…
    const rpc = db.rpcCallsFor('post_journal');
    expect(rpc).toHaveLength(1);
    // …and no direct writes to the ledger tables that could partially fail.
    expect(db.filtersFor('journal_entries')).toHaveLength(0);
    expect(db.filtersFor('journal_entry_lines')).toHaveLength(0);
  });

  it('forwards tenant, author, reference and lines to the function', async () => {
    await postJournal('tenant-A', 'user-1', 'CHQ-001', 'Cheque cleared', LINES);

    const { params } = db.rpcCallsFor('post_journal')[0];
    expect(params).toMatchObject({
      p_tenant_id: 'tenant-A',
      p_created_by: 'user-1',
      p_reference: 'CHQ-001',
      p_description: 'Cheque cleared',
      p_lines: LINES,
    });
  });

  it('attributes the entry to a branch when one is supplied', async () => {
    await postJournal('tenant-A', 'user-1', 'CHQ-001', 'Cheque cleared', LINES, 'branch-9');

    expect(db.rpcCallsFor('post_journal')[0].params).toMatchObject({ p_branch_id: 'branch-9' });
  });

  it('posts a group-level (NULL branch) entry when none is supplied', async () => {
    await postJournal('tenant-A', 'user-1', 'CHQ-001', 'Cheque cleared', LINES);

    expect(db.rpcCallsFor('post_journal')[0].params.p_branch_id).toBeNull();
  });

  it('swallows a function error (best-effort, non-fatal posting)', async () => {
    db.setRpcResolver(() => ({ error: { message: 'CoA missing' } }));
    await expect(
      postJournal('tenant-A', 'user-1', 'CHQ-001', 'Cheque cleared', LINES),
    ).resolves.toBeUndefined();
  });
});
