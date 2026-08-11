/**
 * Regression tests for the P0 stability bug class.
 *
 * Root cause: a Supabase query (`tenantQuery(table).select(...)`) resolves to a
 * `{ data, error }` object — NOT a bare array. ~40 call sites across pages and
 * components treated the resolved value directly as an array
 * (`result.find/.filter/.map/.sort/.length` / `result[0]`), which crashes at
 * runtime (`X.find is not a function`) or silently misbehaves (`.length` is
 * `undefined`, so duplicate-checks always pass).
 *
 * The fix everywhere is to extract `.data` — either by destructuring
 * (`const { data = [] } = await tenantQuery(...)...`) or via the `fetchData`
 * helper. These tests pin down that contract against the REAL production
 * `tenantQuery` / `fetchData` implementations so the footgun can't silently
 * return.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the underlying supabase-js client with a fully-chainable builder whose
// awaited value is always a `{ data, error }` object — exactly like the real
// PostgREST client.
vi.mock('@supabase/supabase-js', () => {
  const ROWS = [
    { id: 'row-1', name: 'Alpha' },
    { id: 'row-2', name: 'Beta' },
  ];
  function chain(result) {
    const self = {
      select: () => chain(result),
      insert: () => chain(result),
      update: () => chain(result),
      delete: () => chain(result),
      upsert: () => chain(result),
      eq: () => chain(result),
      match: () => chain(result),
      order: () => chain(result),
      limit: () => chain(result),
      in: () => chain(result),
      single: () =>
        chain({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
          error: result.error,
        }),
      then: (resolve) => resolve(result),
    };
    return self;
  }
  return {
    createClient: () => ({
      from: () => chain({ data: ROWS, error: null }),
      auth: { autoRefreshToken: true, persistSession: true },
    }),
  };
});

import {
  tenantQuery,
  fetchData,
  setTenantContext,
} from '../api/supabaseClient';

describe('Supabase response shape — root cause of the P0 crash class', () => {
  beforeEach(() => {
    setTenantContext({ tenantId: 'tenant-1', isPlatformOwner: false });
  });

  it('select() resolves to a { data, error } OBJECT, never a bare array', async () => {
    const res = await tenantQuery('students').select('*');

    // This is the trap: the resolved value is NOT an array, so calling array
    // methods on it directly (the pre-fix code) throws.
    expect(Array.isArray(res)).toBe(false);
    expect(res).toHaveProperty('data');
    expect(res).toHaveProperty('error');
    expect(Array.isArray(res.data)).toBe(true);
    expect(typeof res.find).toBe('undefined');
  });

  it('destructuring `{ data }` (the fix) yields a usable array', async () => {
    const { data = [] } = await tenantQuery('invoices')
      .select('*')
      .match({ status: 'pending' })
      .order('created_date', { ascending: false });

    expect(Array.isArray(data)).toBe(true);
    // The exact operations that crashed pre-fix now work.
    expect(typeof data.find).toBe('function');
    expect(data.find((r) => r.id === 'row-2')).toEqual({ id: 'row-2', name: 'Beta' });
    expect(data.filter((r) => r.name).length).toBe(2);
    expect(data.map((r) => r.id)).toEqual(['row-1', 'row-2']);
    expect(data.length).toBe(2);
    expect(data[0]).toEqual({ id: 'row-1', name: 'Alpha' });
  });
});

describe('fetchData helper — extraction used by the fixed call sites', () => {
  beforeEach(() => {
    setTenantContext({ tenantId: 'tenant-1', isPlatformOwner: false });
  });

  it('extracts the data array from a live tenantQuery chain', async () => {
    const rows = await fetchData(
      tenantQuery('grades').select('*').match({ is_active: true })
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
  });

  it('returns [] when data is null (never undefined / non-array)', async () => {
    expect(await fetchData(Promise.resolve({ data: null, error: null }))).toEqual([]);
  });

  it('returns [] on query error instead of leaking the error object', async () => {
    expect(
      await fetchData(Promise.resolve({ data: null, error: { message: 'boom' } }))
    ).toEqual([]);
  });

  it('passes through a populated data array unchanged', async () => {
    expect(
      await fetchData(Promise.resolve({ data: [1, 2, 3], error: null }))
    ).toEqual([1, 2, 3]);
  });
});

describe('single() resolves to a single record under { data } (insert/upsert sites)', () => {
  beforeEach(() => {
    setTenantContext({ tenantId: 'tenant-1', isPlatformOwner: false });
  });

  it('exposes the first row as an object, not an array', async () => {
    const { data } = await tenantQuery('invoices').insert({ x: 1 }).select('id').single();
    expect(Array.isArray(data)).toBe(false);
    expect(data).toEqual({ id: 'row-1', name: 'Alpha' });
  });
});

describe('platform-owner path still resolves to { data, error }', () => {
  beforeEach(() => {
    setTenantContext({ tenantId: null, isPlatformOwner: true });
  });

  it('returns the { data, error } shape for super-admin queries', async () => {
    const { data = [] } = await tenantQuery('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(500);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
  });
});

describe('missing-tenant context fails closed so React Query retries', () => {
  beforeEach(() => {
    // No tenant and not a platform owner -> tenantQuery must throw, not return
    // an empty success that gets cached for 5 minutes.
    setTenantContext({ tenantId: null, isPlatformOwner: false });
  });

  it('throws TenantContextNotReadyError for a non-platform table', async () => {
    await expect(
      (async () =>
        tenantQuery('students')
          .select('*')
          .match({ status: 'active' })
          .order('created_date', { ascending: false })
          .limit(100)
      )()
    ).rejects.toThrow(/tenantId is not set/);
  });

  it('still allows platform-only tables to be queried without a tenant', async () => {
    const { data = [] } = await tenantQuery('currencies')
      .select('*')
      .limit(100);
    expect(Array.isArray(data)).toBe(true);
  });
});
