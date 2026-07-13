/**
 * Messaging routes (/api/messaging) — RBAC, validation, credential redaction,
 * and send (with channel selection) through a connector.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

process.env.AI_CONFIG_ENC_KEY = Buffer.alloc(32, 5).toString('base64');

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { messagingRouter } = await import('../routes/messaging.js');
const { encryptSecret } = await import('../lib/aiCrypto.js');

function app(user: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use(injectUser(user));
  a.use('/api/messaging', messagingRouter);
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

describe('GET /api/messaging/providers', () => {
  it('lists providers with channels for staff', async () => {
    const res = await request(app(teacher)).get('/api/messaging/providers');
    expect(res.status).toBe(200);
    expect(res.body.data.find((p: { id: string }) => p.id === 'infobip').channels).toEqual(['sms', 'whatsapp']);
  });

  it('denies a parent', async () => {
    const res = await request(app(parent)).get('/api/messaging/providers');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/messaging/connectors', () => {
  it('denies a teacher (config is admin/it only)', async () => {
    const res = await request(app(teacher))
      .post('/api/messaging/connectors')
      .send({ provider: 'infobip', display_name: 'X', config: { base_url: 'https://x' }, credentials: { api_key: 'k' } });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid config (infobip without base_url)', async () => {
    const res = await request(app(admin))
      .post('/api/messaging/connectors')
      .send({ provider: 'infobip', display_name: 'X', credentials: { api_key: 'k' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_config');
  });

  it('creates a connector and never returns credentials', async () => {
    db.setResolver((ctx) =>
      ctx.table === 'messaging_connectors' && ctx.op === 'insert'
        ? { data: { id: 'm1', provider: 'infobip', display_name: 'Infobip', config: {}, is_active: true, status: 'configured', created_at: 'now' } }
        : { data: null },
    );
    const res = await request(app(admin))
      .post('/api/messaging/connectors')
      .send({ provider: 'infobip', display_name: 'Infobip', config: { base_url: 'https://x.api.infobip.com', sender: 'EduSaga' }, credentials: { api_key: 'supersecret' } });
    expect(res.status).toBe(201);
    expect(res.body.data.credentials).toBeUndefined();
    const insert = db.filtersFor('messaging_connectors').find((c) => c.op === 'insert')!;
    expect(JSON.stringify(insert.payload)).not.toContain('supersecret');
  });
});

describe('POST /api/messaging/connectors/:id/send', () => {
  it('sends over the requested channel (staff allowed)', async () => {
    const encCreds = encryptSecret(JSON.stringify({ api_key: 'k' }));
    db.setResolver((ctx) =>
      ctx.table === 'messaging_connectors' && ctx.op === 'select'
        ? { data: { id: 'm1', provider: 'infobip', config: { base_url: 'https://x.api.infobip.com', sender: 'EduSaga', whatsapp_sender: '9665000' }, credentials: encCreds } }
        : { data: null },
    );
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ messageId: 'wa-9' }] }) })));

    const res = await request(app(teacher))
      .post('/api/messaging/connectors/m1/send')
      .send({ to: '966511111111', text: 'Hello', channel: 'whatsapp' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 'wa-9', channel: 'whatsapp' });
  });

  it('rejects a channel the provider does not support', async () => {
    const encCreds = encryptSecret(JSON.stringify({ bearer_token: 't' }));
    db.setResolver((ctx) =>
      ctx.table === 'messaging_connectors' && ctx.op === 'select'
        ? { data: { id: 'm2', provider: 'taqnyat', config: { sender: 'X' }, credentials: encCreds } }
        : { data: null },
    );
    const res = await request(app(teacher))
      .post('/api/messaging/connectors/m2/send')
      .send({ to: '+966511111111', text: 'Hi', channel: 'whatsapp' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_channel');
  });

  it('denies a parent from sending', async () => {
    const res = await request(app(parent))
      .post('/api/messaging/connectors/m1/send')
      .send({ to: '+1', text: 'Hi' });
    expect(res.status).toBe(403);
  });
});
