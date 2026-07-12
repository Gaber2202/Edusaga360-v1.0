/**
 * External Integration API (/api/v1) — staff, guardians, invoices resources.
 *
 * Each resource follows the same contract proven for students: scope-gated,
 * tenant-isolated, and (for writes) idempotent on a natural key. These tests pin
 * the scope boundary, the tenant scoping of every query, and the idempotent
 * upsert behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { apiKeyAuth } = await import('../middleware/apiKeyAuth.js');
const { externalApiRouter } = await import('../routes/external/v1.js');
const { generateApiKey } = await import('../lib/apiKeys.js');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1', apiKeyAuth, externalApiRouter);
  return a;
}

// Mint a key and wire the resolver: api_keys lookup returns a row with `scopes`,
// and `rest` supplies results for the resource tables.
function withScopes(
  scopes: string[],
  rest: (ctx: { table: string; op: string }) => { data?: unknown; count?: number } | undefined = () => undefined,
) {
  const key = generateApiKey();
  db.setResolver((ctx) => {
    if (ctx.table === 'api_keys' && ctx.op === 'select') {
      return { data: { id: 'k1', tenant_id: 'tenant-A', key_hash: key.hash, scopes, revoked_at: null, expires_at: null } };
    }
    if (ctx.table === 'api_keys') return { data: null };
    return rest(ctx);
  });
  return key.plaintext;
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('/api/v1/staff', () => {
  it('denies read without staff:read', async () => {
    const k = withScopes([]);
    const res = await request(app()).get('/api/v1/staff').set('X-API-Key', k);
    expect(res.status).toBe(403);
  });

  it('lists staff scoped to the key tenant', async () => {
    const k = withScopes(['staff:read'], (ctx) =>
      ctx.table === 'employees' ? { data: [{ id: 'e1', employee_number: 'E-1', name_en: 'Sara' }], count: 1 } : undefined,
    );
    const res = await request(app()).get('/api/v1/staff').set('X-API-Key', k);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(db.everyQueryScopedToTenant('employees', 'tenant-A')).toBe(true);
  });

  it('is idempotent on employee_number', async () => {
    const k = withScopes(['staff:write'], (ctx) =>
      ctx.table === 'employees' && ctx.op === 'select' ? { data: { id: 'existing-e' } } : undefined,
    );
    const res = await request(app())
      .post('/api/v1/staff')
      .set('X-API-Key', k)
      .send({ employee_number: 'E-1', name_en: 'Sara' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.data.id).toBe('existing-e');
  });

  it('creates a new staff member (201)', async () => {
    const k = withScopes(['staff:write'], (ctx) => {
      if (ctx.table !== 'employees') return undefined;
      if (ctx.op === 'select') return { data: null };
      if (ctx.op === 'insert') return { data: { id: 'new-e' } };
      return undefined;
    });
    const res = await request(app())
      .post('/api/v1/staff')
      .set('X-API-Key', k)
      .send({ employee_number: 'E-2', name_en: 'Omar', employment_type: 'full_time' });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
  });

  it('rejects an invalid body (missing name_en/employee_number)', async () => {
    const k = withScopes(['staff:write']);
    const res = await request(app()).post('/api/v1/staff').set('X-API-Key', k).send({ email: 'x@y.sa' });
    expect(res.status).toBe(400);
  });
});

describe('/api/v1/guardians', () => {
  it('denies write without guardians:write', async () => {
    const k = withScopes(['guardians:read']);
    const res = await request(app())
      .post('/api/v1/guardians')
      .set('X-API-Key', k)
      .send({ name_en: 'Parent', national_id: '1' });
    expect(res.status).toBe(403);
  });

  it('creates a guardian scoped to the tenant', async () => {
    const k = withScopes(['guardians:write'], (ctx) => {
      if (ctx.table !== 'guardians') return undefined;
      if (ctx.op === 'select') return { data: null };
      if (ctx.op === 'insert') return { data: { id: 'g1' } };
      return undefined;
    });
    const res = await request(app())
      .post('/api/v1/guardians')
      .set('X-API-Key', k)
      .send({ name_en: 'Parent One', national_id: '1088', phone: '0500000000' });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
  });
});

describe('/api/v1/invoices', () => {
  it('denies read without invoices:read', async () => {
    const k = withScopes([]);
    const res = await request(app()).get('/api/v1/invoices').set('X-API-Key', k);
    expect(res.status).toBe(403);
  });

  it('lists invoices scoped to the tenant', async () => {
    const k = withScopes(['invoices:read'], (ctx) =>
      ctx.table === 'invoices' ? { data: [{ id: 'i1', invoice_number: 'INV-1', total_amount: 100 }], count: 1 } : undefined,
    );
    const res = await request(app()).get('/api/v1/invoices?status=issued').set('X-API-Key', k);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(db.everyQueryScopedToTenant('invoices', 'tenant-A')).toBe(true);
  });
});
