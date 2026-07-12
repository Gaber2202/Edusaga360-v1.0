/**
 * ATS routes (/api/ats) — RBAC, provider/config validation, credential
 * redaction, and an end-to-end connector sync with a stubbed provider fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

// aiCrypto reads this at call time — set before the router (and its imports) load.
process.env.AI_CONFIG_ENC_KEY = Buffer.alloc(32, 7).toString('base64');

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { atsRouter } = await import('../routes/ats.js');
const { encryptSecret } = await import('../lib/aiCrypto.js');

function app(user: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use(injectUser(user));
  a.use('/api/ats', atsRouter);
  return a;
}

const admin = { id: 'u1', email: 'admin@school.sa', tenant_id: 'tenant-A', role: 'admin' };
const hrOfficer = { id: 'u2', email: 'hr@school.sa', tenant_id: 'tenant-A', role: 'hr_officer' };
const teacher = { id: 'u3', email: 't@school.sa', tenant_id: 'tenant-A', role: 'teacher' };

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  db.setResolver(() => ({ data: null }));
});

describe('GET /api/ats/providers', () => {
  it('lists all five providers for an HR user', async () => {
    const res = await request(app(hrOfficer)).get('/api/ats/providers');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id).sort()).toEqual(['custom', 'greenhouse', 'indeed', 'linkedin', 'workday']);
  });

  it('denies a non-HR user (teacher)', async () => {
    const res = await request(app(teacher)).get('/api/ats/providers');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/ats/connectors', () => {
  it('denies an hr_officer (not an ATS admin role)', async () => {
    const res = await request(app(hrOfficer))
      .post('/api/ats/connectors')
      .send({ provider: 'greenhouse', display_name: 'GH', credentials: { api_key: 'k' } });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown provider', async () => {
    const res = await request(app(admin))
      .post('/api/ats/connectors')
      .send({ provider: 'bamboo', display_name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_provider');
  });

  it('rejects a config that fails provider validation (greenhouse without api_key)', async () => {
    const res = await request(app(admin))
      .post('/api/ats/connectors')
      .send({ provider: 'greenhouse', display_name: 'GH' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_config');
  });

  it('creates a valid connector and never returns credentials', async () => {
    db.setResolver((ctx) =>
      ctx.table === 'ats_connectors' && ctx.op === 'insert'
        ? { data: { id: 'c1', provider: 'greenhouse', display_name: 'GH', config: {}, is_active: true, status: 'configured', created_at: 'now' } }
        : { data: null },
    );
    const res = await request(app(admin))
      .post('/api/ats/connectors')
      .send({ provider: 'greenhouse', display_name: 'GH', credentials: { api_key: 'secret-key' } });
    expect(res.status).toBe(201);
    expect(res.body.data.provider).toBe('greenhouse');
    expect(res.body.data.credentials).toBeUndefined();
    // The stored payload must hold ciphertext, not the raw key.
    const insert = db.filtersFor('ats_connectors').find((c) => c.op === 'insert')!;
    const payload = insert.payload as Record<string, unknown>;
    expect(typeof payload.credentials).toBe('string');
    expect(JSON.stringify(payload)).not.toContain('secret-key');
  });
});

describe('GET /api/ats/connectors', () => {
  it('redacts credentials to a has_credentials boolean', async () => {
    db.setResolver((ctx) =>
      ctx.table === 'ats_connectors' && ctx.op === 'select'
        ? { data: [{ id: 'c1', provider: 'greenhouse', display_name: 'GH', config: {}, is_active: true, status: 'ok', credentials: 'ENCRYPTED_BLOB', created_at: 'now' }] }
        : { data: null },
    );
    const res = await request(app(hrOfficer)).get('/api/ats/connectors');
    expect(res.status).toBe(200);
    expect(res.body.data[0].has_credentials).toBe(true);
    expect(res.body.data[0].credentials).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('ENCRYPTED_BLOB');
  });
});

describe('POST /api/ats/connectors/:id/sync', () => {
  it('pulls candidates from the provider and upserts them', async () => {
    const encCreds = encryptSecret(JSON.stringify({ token: 'abc' }));
    db.setResolver((ctx) => {
      if (ctx.table === 'ats_connectors' && ctx.op === 'select') {
        return {
          data: {
            id: 'c1',
            provider: 'custom',
            config: { base_url: 'https://ats.example.com/candidates', field_map: { external_id: 'id', full_name: 'name' } },
            credentials: encCreds,
          },
        };
      }
      if (ctx.table === 'hr_candidates' && ctx.op === 'select') return { data: null };
      return { data: null };
    });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }],
    })));

    const res = await request(app(admin)).post('/api/ats/connectors/c1/sync').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, fetched: 2, created: 2, updated: 0 });
  });

  it('404s for an unknown connector', async () => {
    db.setResolver(() => ({ data: null }));
    const res = await request(app(admin)).post('/api/ats/connectors/missing/sync').send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/ats/connectors/:id', () => {
  it('deletes an existing connector', async () => {
    db.setResolver((ctx) => (ctx.table === 'ats_connectors' && ctx.op === 'delete' ? { data: { id: 'c1' } } : { data: null }));
    const res = await request(app(admin)).delete('/api/ats/connectors/c1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('denies a teacher', async () => {
    const res = await request(app(teacher)).delete('/api/ats/connectors/c1');
    expect(res.status).toBe(403);
  });
});
