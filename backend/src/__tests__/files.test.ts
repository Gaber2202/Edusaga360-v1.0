/**
 * File upload endpoint — /api/files
 *
 * Guards the behaviour that was shipped broken:
 *   - Platform owners (no tenant_id) must be able to upload (path under `platform/`)
 *   - The UI offers HEIC/WEBP/GIF/CSV — the backend must accept them, not 415
 *   - Magic-byte validation still rejects disguised / unsupported binaries
 *   - 10 MB streaming limit, non-multipart rejection, oversize → 413
 *   - GET /sign re-mints URLs and enforces tenant ownership
 *
 * The real multipart parser runs end-to-end (supertest sends real form-data);
 * only Supabase Storage is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { RequestHandler } from 'express';

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  sign: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload: h.upload, createSignedUrl: h.sign }),
    },
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }),
}));

const { filesRouter } = await import('../routes/files.js');

const TENANT_USER = { id: 'u1', email: 'a@school.sa', tenant_id: 'tenant-A', role: 'admin', is_platform_owner: false };
const PLATFORM_OWNER = { id: 'p1', email: 'owner@edusaga360.com', tenant_id: undefined, role: undefined, is_platform_owner: true };

function injectUser(user: Record<string, unknown> | undefined): RequestHandler {
  return (req, _res, next) => { (req as unknown as { user?: unknown }).user = user; next(); };
}

function makeApp(user: Record<string, unknown> | undefined = TENANT_USER) {
  const app = express();
  app.use(express.json()); // mirror production: global json parser must NOT eat multipart
  app.use(injectUser(user));
  app.use('/api/files', filesRouter);
  return app;
}

// ── Magic-byte sample files ───────────────────────────────────────────────────
const pad = (n: number) => Buffer.alloc(n, 0x41);
const FILES = {
  pdf: Buffer.concat([Buffer.from('%PDF-1.4\n'), pad(64)]),
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad(64)]),
  jpg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad(64)]),
  gif: Buffer.concat([Buffer.from('GIF89a'), pad(64)]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), pad(64)]),
  heic: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), pad(64)]),
  docx: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), pad(64)]),
  csv: Buffer.from('name,score\nAli,90\nSara,95\n'),
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  junk: Buffer.concat([Buffer.from([0x00, 0x01, 0x02, 0x03]), pad(64)]),
};

beforeEach(() => {
  vi.clearAllMocks();
  h.upload.mockResolvedValue({ error: null });
  h.sign.mockResolvedValue({ data: { signedUrl: 'https://signed.example/url' }, error: null });
});

describe('POST /api/files/upload — accepted types', () => {
  const cases: Array<[string, Buffer, string, string]> = [
    ['pdf', FILES.pdf, 'doc.pdf', 'application/pdf'],
    ['png', FILES.png, 'img.png', 'image/png'],
    ['jpg', FILES.jpg, 'img.jpg', 'image/jpeg'],
    ['gif', FILES.gif, 'img.gif', 'image/gif'],
    ['webp', FILES.webp, 'img.webp', 'image/webp'],
    ['heic', FILES.heic, 'photo.heic', 'image/heic'],
    ['docx', FILES.docx, 'doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['csv', FILES.csv, 'punches.csv', 'text/csv'],
  ];

  it.each(cases)('accepts %s and returns a tenant-scoped path + signed URL', async (ext, buf, filename, contentType) => {
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', buf, { filename, contentType });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.signedUrl).toBe('https://signed.example/url');
    expect(res.body.path).toMatch(/^tenant-A\/\d{4}\/[0-9a-f-]{36}\./);
    // bytes that hit storage match what we sent (parser extracted the file cleanly)
    const stored = h.upload.mock.calls[0][1] as Buffer;
    expect(Buffer.compare(stored, buf)).toBe(0);
  });

  it('disambiguates xlsx from docx via declared mime', async () => {
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', FILES.docx, { filename: 'sheet.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/\.xlsx$/);
  });
});

describe('POST /api/files/upload — rejected types', () => {
  it('rejects SVG (script vector) with 415', async () => {
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', FILES.svg, { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects an unknown binary with 415', async () => {
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', FILES.junk, { filename: 'x.bin', contentType: 'application/octet-stream' });
    expect(res.status).toBe(415);
  });

  it('rejects a file masquerading as csv but containing binary (NUL bytes)', async () => {
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', FILES.junk, { filename: 'x.csv', contentType: 'text/csv' });
    expect(res.status).toBe(415);
  });
});

describe('POST /api/files/upload — auth & scope', () => {
  it('lets a platform owner upload under the platform/ namespace', async () => {
    const res = await request(makeApp(PLATFORM_OWNER))
      .post('/api/files/upload')
      .attach('file', FILES.pdf, { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.path).toMatch(/^platform\/\d{4}\//);
  });

  it('401s an unauthenticated request', async () => {
    // Build an app with NO user injected (can't pass undefined to makeApp — it
    // would hit the default param).
    const app = express();
    app.use(express.json());
    app.use('/api/files', filesRouter);
    const res = await request(app)
      .post('/api/files/upload')
      .attach('file', FILES.pdf, { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(401);
  });

  it('400s a non-multipart request', async () => {
    const res = await request(makeApp())
      .post('/api/files/upload')
      .set('Content-Type', 'application/json')
      .send({ not: 'a file' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/files/upload — limits & storage errors', () => {
  it('413s a file over the 10 MB limit', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 1024, 0x41)]);
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
  });

  it('surfaces a missing-bucket error with an actionable 500 message', async () => {
    h.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    const res = await request(makeApp())
      .post('/api/files/upload')
      .attach('file', FILES.pdf, { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/bucket/i);
  });

  it('never calls storage when the type is rejected', async () => {
    await request(makeApp())
      .post('/api/files/upload')
      .attach('file', FILES.junk, { filename: 'x.bin', contentType: 'application/octet-stream' });
    expect(h.upload).not.toHaveBeenCalled();
  });
});

describe('GET /api/files/sign — re-mint signed URLs', () => {
  it('signs a path inside the caller’s own tenant folder', async () => {
    const res = await request(makeApp())
      .get('/api/files/sign')
      .query({ path: 'tenant-A/2026/abc.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.signedUrl).toBe('https://signed.example/url');
  });

  it('403s a tenant user signing another tenant’s file', async () => {
    const res = await request(makeApp())
      .get('/api/files/sign')
      .query({ path: 'tenant-B/2026/abc.pdf' });
    expect(res.status).toBe(403);
    expect(h.sign).not.toHaveBeenCalled();
  });

  it('lets a platform owner sign any path', async () => {
    const res = await request(makeApp(PLATFORM_OWNER))
      .get('/api/files/sign')
      .query({ path: 'tenant-B/2026/abc.pdf' });
    expect(res.status).toBe(200);
  });

  it('400s when path is missing', async () => {
    const res = await request(makeApp()).get('/api/files/sign');
    expect(res.status).toBe(400);
  });
});
