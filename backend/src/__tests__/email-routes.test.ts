/**
 * Email routes (/api/email) — RBAC, provider/config validation, credential
 * redaction, send through a connector, and inbound sync.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

process.env.AI_CONFIG_ENC_KEY = Buffer.alloc(32, 9).toString('base64');

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { emailConnectorsRouter } = await import('../routes/emailConnectors.js');
const { encryptSecret } = await import('../lib/aiCrypto.js');

function app(user: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use(injectUser(user));
  a.use('/api/email', emailConnectorsRouter);
  return a;
}

const admin = { id: 'u1', email: 'admin@school.sa', tenant_id: 'tenant-A', role: 'admin' };
const teacher = { id: 'u2', email: 't@school.sa', tenant_id: 'tenant-A', role: 'teacher' };
const parent = { id: 'u3', email: 'p@x.com', tenant_id: 'tenant-A', role: 'parent' };

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  db.setResolver(() => ({ data: null }));
});

describe('GET /api/email/providers', () => {
  it('lists providers for staff', async () => {
    const res = await request(app(teacher)).get('/api/email/providers');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id).sort()).toEqual(['custom', 'gmail', 'microsoft', 'smtp']);
  });

  it('denies a parent (not staff)', async () => {
    const res = await request(app(parent)).get('/api/email/providers');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/email/connectors', () => {
  it('denies a teacher (config is admin/it only)', async () => {
    const res = await request(app(teacher))
      .post('/api/email/connectors')
      .send({ provider: 'smtp', display_name: 'X', config: { host: 'h', port: 587, from: 'a@b' }, credentials: { user: 'u', pass: 'p' } });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid config (smtp missing host)', async () => {
    const res = await request(app(admin))
      .post('/api/email/connectors')
      .send({ provider: 'smtp', display_name: 'X', credentials: { user: 'u', pass: 'p' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_config');
  });

  it('creates a connector and never returns credentials', async () => {
    db.setResolver((ctx) =>
      ctx.table === 'email_connectors' && ctx.op === 'insert'
        ? { data: { id: 'e1', provider: 'smtp', display_name: 'School SMTP', config: {}, is_active: true, status: 'configured', created_at: 'now' } }
        : { data: null },
    );
    const res = await request(app(admin))
      .post('/api/email/connectors')
      .send({ provider: 'smtp', display_name: 'School SMTP', config: { host: 'h', port: 587, from: 'a@b' }, credentials: { user: 'u', pass: 'topsecret' } });
    expect(res.status).toBe(201);
    expect(res.body.data.credentials).toBeUndefined();
    const insert = db.filtersFor('email_connectors').find((c) => c.op === 'insert')!;
    expect(JSON.stringify(insert.payload)).not.toContain('topsecret');
  });
});

describe('POST /api/email/connectors/:id/send', () => {
  it('sends through a gmail connector (staff allowed)', async () => {
    const encCreds = encryptSecret(JSON.stringify({ access_token: 'tok' }));
    db.setResolver((ctx) =>
      ctx.table === 'email_connectors' && ctx.op === 'select'
        ? { data: { id: 'e1', provider: 'gmail', config: { from: 'noreply@school.sa' }, credentials: encCreds } }
        : { data: null },
    );
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'sent-1' }) })));

    const res = await request(app(teacher))
      .post('/api/email/connectors/e1/send')
      .send({ to: 'x@y.com', subject: 'Hello', html: '<b>Hi</b>' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 'sent-1' });
  });

  it('denies a parent from sending', async () => {
    const res = await request(app(parent))
      .post('/api/email/connectors/e1/send')
      .send({ to: 'x@y.com', subject: 'S', text: 'T' });
    expect(res.status).toBe(403);
  });

  it('rejects a message with neither html nor text', async () => {
    const res = await request(app(teacher))
      .post('/api/email/connectors/e1/send')
      .send({ to: 'x@y.com', subject: 'S' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/email/connectors/:id/sync', () => {
  it('rejects inbound sync on a send-only provider (smtp)', async () => {
    db.setResolver((ctx) =>
      ctx.table === 'email_connectors' && ctx.op === 'select'
        ? { data: { id: 'e1', provider: 'smtp', config: {}, credentials: null } }
        : { data: null },
    );
    const res = await request(app(admin)).post('/api/email/connectors/e1/sync').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('receive_unsupported');
  });

  it('syncs inbound from a microsoft connector', async () => {
    const encCreds = encryptSecret(JSON.stringify({ access_token: 'tok' }));
    db.setResolver((ctx) => {
      if (ctx.table === 'email_connectors' && ctx.op === 'select') {
        return { data: { id: 'e1', provider: 'microsoft', config: {}, credentials: encCreds } };
      }
      if (ctx.table === 'email_messages' && ctx.op === 'select') return { data: null };
      return { data: null };
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ value: [{ id: 'm1', subject: 'A', from: { emailAddress: { address: 'p@x.com' } } }] }),
    })));

    const res = await request(app(admin)).post('/api/email/connectors/e1/sync').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, fetched: 1, created: 1, updated: 0 });
  });
});
