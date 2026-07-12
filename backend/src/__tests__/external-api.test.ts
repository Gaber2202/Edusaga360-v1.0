/**
 * External Integration API (/api/v1) — API-key auth + scope enforcement.
 *
 * Pins the security boundary of the public data plane: no key / bad key / revoked
 * / expired all 401; a valid key resolves the right tenant + scopes; scope gates
 * fire before handlers; and every data query is scoped to the key's tenant.
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

// Resolver that returns a stored api_keys row (built from a freshly minted key)
// for the auth lookup, and lets the caller supply extra table results.
function withKey(
  key: { hash: string },
  keyRow: Record<string, unknown>,
  rest: (ctx: { table: string; op: string }) => { data?: unknown; count?: number } | undefined = () => undefined,
) {
  db.setResolver((ctx) => {
    if (ctx.table === 'api_keys' && ctx.op === 'select') {
      return { data: { id: 'k1', tenant_id: 'tenant-A', key_hash: key.hash, scopes: [], revoked_at: null, expires_at: null, ...keyRow } };
    }
    if (ctx.table === 'api_keys') return { data: null }; // last_used_at bump
    return rest(ctx);
  });
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('apiKeyAuth', () => {
  it('rejects a missing key', async () => {
    const res = await request(app()).get('/api/v1/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed (non-esk) key', async () => {
    const res = await request(app()).get('/api/v1/whoami').set('Authorization', 'Bearer not-a-key');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown key', async () => {
    const key = generateApiKey();
    db.setResolver((ctx) => (ctx.table === 'api_keys' ? { data: null } : undefined));
    const res = await request(app()).get('/api/v1/whoami').set('Authorization', `Bearer ${key.plaintext}`);
    expect(res.status).toBe(401);
  });

  it('rejects a key whose secret does not match the stored hash', async () => {
    const stored = generateApiKey();
    const attacker = generateApiKey(); // same prefix space, different secret
    withKey(stored, {});
    const res = await request(app()).get('/api/v1/whoami').set('Authorization', `Bearer ${attacker.plaintext}`);
    expect(res.status).toBe(401);
  });

  it('rejects a revoked key', async () => {
    const key = generateApiKey();
    withKey(key, { revoked_at: new Date().toISOString() });
    const res = await request(app()).get('/api/v1/whoami').set('X-API-Key', key.plaintext);
    expect(res.status).toBe(401);
  });

  it('rejects an expired key', async () => {
    const key = generateApiKey();
    withKey(key, { expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await request(app()).get('/api/v1/whoami').set('X-API-Key', key.plaintext);
    expect(res.status).toBe(401);
  });

  it('accepts a valid key and resolves identity (via X-API-Key)', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: ['students:read'] });
    const res = await request(app()).get('/api/v1/whoami').set('X-API-Key', key.plaintext);
    expect(res.status).toBe(200);
    expect(res.body.tenant_id).toBe('tenant-A');
    expect(res.body.scopes).toContain('students:read');
  });
});

describe('/api/v1/ping', () => {
  it('does not require a scope, only a valid key', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: [] });
    const res = await request(app()).get('/api/v1/ping').set('X-API-Key', key.plaintext);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('/api/v1/students — scope + tenant isolation', () => {
  it('denies read without the students:read scope', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: [] });
    const res = await request(app()).get('/api/v1/students').set('X-API-Key', key.plaintext);
    expect(res.status).toBe(403);
  });

  it('allows read with the scope and scopes the query to the key tenant', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: ['students:read'] }, (ctx) =>
      ctx.table === 'students' ? { data: [{ id: 's1', name_en: 'Ahmed' }], count: 1 } : undefined,
    );
    const res = await request(app()).get('/api/v1/students').set('X-API-Key', key.plaintext);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
    expect(db.everyQueryScopedToTenant('students', 'tenant-A')).toBe(true);
  });

  it('denies write without the students:write scope', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: ['students:read'] });
    const res = await request(app())
      .post('/api/v1/students')
      .set('X-API-Key', key.plaintext)
      .send({ name_en: 'New Kid', national_id: '1234567890' });
    expect(res.status).toBe(403);
  });

  it('is idempotent on national_id (re-POST returns existing, created:false)', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: ['students:write'] }, (ctx) =>
      ctx.table === 'students' && ctx.op === 'select' ? { data: { id: 'existing-1' } } : undefined,
    );
    const res = await request(app())
      .post('/api/v1/students')
      .set('X-API-Key', key.plaintext)
      .send({ name_en: 'Dup Kid', national_id: '1234567890' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.data.id).toBe('existing-1');
  });

  it('creates a new student (201, created:true) when none exists', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: ['students:write'] }, (ctx) => {
      if (ctx.table !== 'students') return undefined;
      if (ctx.op === 'select') return { data: null };
      if (ctx.op === 'insert') return { data: { id: 'new-1' } };
      return undefined;
    });
    const res = await request(app())
      .post('/api/v1/students')
      .set('X-API-Key', key.plaintext)
      .send({ name_en: 'Fresh Kid', national_id: '9999999999' });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.data.id).toBe('new-1');
  });

  it('rejects an invalid create body with 400', async () => {
    const key = generateApiKey();
    withKey(key, { scopes: ['students:write'] });
    const res = await request(app())
      .post('/api/v1/students')
      .set('X-API-Key', key.plaintext)
      .send({ name_ar: 'no english name or id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
});
