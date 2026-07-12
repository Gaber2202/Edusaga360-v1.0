/**
 * API key management (/api/api-keys) — admin-only control plane.
 *
 * Covers the RBAC boundary (only `admin` / platform owner may manage keys), the
 * "secret shown exactly once" contract on create, scope validation, and revoke.
 * Also unit-tests the key mint/verify primitives in lib/apiKeys.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { apiKeysRouter } = await import('../routes/apiKeys.js');
const { generateApiKey, verifyKey, prefixOf, hashKey } = await import('../lib/apiKeys.js');

function app(user: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use(injectUser(user));
  a.use('/api/api-keys', apiKeysRouter);
  return a;
}

const admin = { id: 'u1', email: 'admin@school.sa', tenant_id: 'tenant-A', role: 'admin' };
const teacher = { id: 'u2', email: 'teacher@school.sa', tenant_id: 'tenant-A', role: 'teacher' };

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  db.setResolver(() => ({ data: null }));
});

describe('lib/apiKeys', () => {
  it('mints a verifiable esk_ key and round-trips prefix + hash', () => {
    const key = generateApiKey();
    expect(key.plaintext).toMatch(/^esk_(live|test)_[0-9a-f]{48}$/);
    expect(key.prefix).toBe(prefixOf(key.plaintext));
    expect(key.hash).toBe(hashKey(key.plaintext));
    expect(verifyKey(key.plaintext, key.hash)).toBe(true);
  });

  it('rejects a wrong secret against a stored hash', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(verifyKey(b.plaintext, a.hash)).toBe(false);
  });

  it('does not throw on a malformed stored hash', () => {
    const key = generateApiKey();
    expect(verifyKey(key.plaintext, 'deadbeef')).toBe(false);
  });
});

describe('GET /api/api-keys/scopes', () => {
  it('returns the grantable scope list to an admin', async () => {
    const res = await request(app(admin)).get('/api/api-keys/scopes');
    expect(res.status).toBe(200);
    expect(res.body.data).toContain('students:read');
  });

  it('denies a non-admin', async () => {
    const res = await request(app(teacher)).get('/api/api-keys/scopes');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/api-keys', () => {
  it('denies a non-admin (teacher) with 403', async () => {
    const res = await request(app(teacher))
      .post('/api/api-keys')
      .send({ name: 'Legacy SIS', scopes: ['students:read'] });
    expect(res.status).toBe(403);
  });

  it('rejects an unrecognised scope with 400', async () => {
    const res = await request(app(admin))
      .post('/api/api-keys')
      .send({ name: 'Bad', scopes: ['students:destroy'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('creates a key and returns the plaintext secret exactly once', async () => {
    db.setResolver((ctx) =>
      ctx.table === 'api_keys' && ctx.op === 'insert'
        ? { data: { id: 'k1', name: 'Legacy SIS', key_prefix: 'esk_test_abc123', scopes: ['students:read'], expires_at: null, created_at: '2026-07-12T00:00:00Z' } }
        : { data: null },
    );
    const res = await request(app(admin))
      .post('/api/api-keys')
      .send({ name: 'Legacy SIS', scopes: ['students:read'] });
    expect(res.status).toBe(201);
    expect(res.body.api_key).toMatch(/^esk_/);
    expect(res.body.key_prefix).toBeDefined();
    // The stored hash must never be handed back.
    expect(res.body.key_hash).toBeUndefined();
  });

  it('persists only the hash + prefix, never the plaintext', async () => {
    let inserted: Record<string, unknown> | undefined;
    db.setResolver((ctx) => {
      if (ctx.table === 'api_keys' && ctx.op === 'insert') {
        inserted = ctx.payload as Record<string, unknown>;
        return { data: { id: 'k1', name: 'x', key_prefix: inserted.key_prefix, scopes: [], expires_at: null, created_at: 'now' } };
      }
      return { data: null };
    });
    const res = await request(app(admin))
      .post('/api/api-keys')
      .send({ name: 'x', scopes: ['students:read'] });
    expect(res.status).toBe(201);
    expect(inserted).toBeDefined();
    expect(inserted!.key_hash).toBeDefined();
    expect(inserted!.key_prefix).toBeDefined();
    // Whatever plaintext was returned must NOT appear in the stored row.
    expect(JSON.stringify(inserted)).not.toContain(res.body.api_key);
  });
});

describe('DELETE /api/api-keys/:id', () => {
  it('denies a non-admin with 403', async () => {
    const res = await request(app(teacher)).delete('/api/api-keys/k1');
    expect(res.status).toBe(403);
  });

  it('revokes an existing key', async () => {
    db.setResolver((ctx) => (ctx.table === 'api_keys' && ctx.op === 'update' ? { data: { id: 'k1' } } : { data: null }));
    const res = await request(app(admin)).delete('/api/api-keys/k1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('404s when the key does not exist for this tenant', async () => {
    db.setResolver(() => ({ data: null }));
    const res = await request(app(admin)).delete('/api/api-keys/missing');
    expect(res.status).toBe(404);
  });
});
