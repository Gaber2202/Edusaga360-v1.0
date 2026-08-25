/**
 * P4 Sprint 1 regression — admissions messaging, contract PDF/share, public intake routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const {
  mapStageToNotifyEvent,
  sendAdmissionsStageMessage,
} = await import('../services/admissionsMessaging.js');
const { renderEnrollmentContractPdf } = await import('../services/contractPdf.js');
const { shareContractBothChannels } = await import('../services/contractShare.js');
const { contractsRouter } = await import('../routes/contracts.js');
const { admissionsRouter } = await import('../routes/admissions.js');
const { publicIntakeRouter } = await import('../routes/publicIntake.js');

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SCRUM-115 mapStageToNotifyEvent', () => {
  it('maps welcome / rejection / assessment / interview', () => {
    expect(mapStageToNotifyEvent('submitted')).toBe('welcome');
    expect(mapStageToNotifyEvent('accepted')).toBe('welcome');
    expect(mapStageToNotifyEvent('rejected')).toBe('rejection');
    expect(mapStageToNotifyEvent('assessment')).toBe('assessment_results');
    expect(mapStageToNotifyEvent('interview')).toBe('interview_scheduling');
  });

  it('maps documents_missing override', () => {
    expect(mapStageToNotifyEvent('submitted', { documentsMissing: true })).toBe('documents_missing');
  });

  it('returns null for stages without a parent event', () => {
    expect(mapStageToNotifyEvent('committee')).toBeNull();
    expect(mapStageToNotifyEvent('waitlist')).toBeNull();
  });
});

describe('SCRUM-115 sendAdmissionsStageMessage', () => {
  it('skips when guardian phone missing', async () => {
    const result = await sendAdmissionsStageMessage({
      tenantId: 'tenant-A',
      application: { id: 'app-1', student_name_ar: 'أحمد' },
      event: 'welcome',
    });
    expect(result.sent).toBe(false);
    expect(result.skipped).toBe('no_guardian_phone');
  });

  it('sends one bilingual Infobip WhatsApp body', async () => {
    vi.stubEnv('INFOBIP_API_KEY', 'test-key');
    vi.stubEnv('INFOBIP_BASE_URL', 'https://api.infobip.com');
    vi.stubEnv('INFOBIP_WHATSAPP_SENDER', '966500000000');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'msg-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    db.setResolver((ctx) => {
      if (ctx.table === 'communications' || ctx.table === 'intake_comm_logs') {
        return { data: null, error: null };
      }
      return { data: null };
    });

    const result = await sendAdmissionsStageMessage({
      tenantId: 'tenant-A',
      application: {
        id: 'app-1',
        guardian_whatsapp: '0501234567',
        guardian_name_ar: 'ولي الأمر',
        student_name_ar: 'أحمد',
        applying_for_grade: 'Grade1',
        application_number: 'APP-1',
      },
      event: 'welcome',
    });

    expect(result.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.content.text).toContain('ولي الأمر');
    expect(body.content.text).toContain('Hello');
    expect(body.content.text).toContain('———');
  });
});

describe('SCRUM-117 renderEnrollmentContractPdf', () => {
  it('returns a PDF buffer with %PDF header', async () => {
    const buf = await renderEnrollmentContractPdf({
      schoolNameEn: 'Demo School',
      schoolNameAr: 'مدرسة تجريبية',
      contractNumber: 'CT-1',
      studentName: 'Ali',
      guardianName: 'Omar',
      contentEn: '<p>English terms</p>',
      contentAr: '<p>شروط عربية</p>',
      jurisdictionCode: 'SA',
      netAmount: 1000,
      currencyCode: 'SAR',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(500);
  });
});

describe('SCRUM-118 shareContractBothChannels', () => {
  it('fails closed when email or WhatsApp cannot send', async () => {
    vi.stubEnv('INFOBIP_API_KEY', '');
    vi.stubEnv('INFOBIP_BASE_URL', '');

    db.setResolver(() => ({ data: null, error: null }));

    const result = await shareContractBothChannels(db.client as never, {
      tenantId: 'tenant-A',
      contract: {
        id: 'c1',
        contract_number: 'CT-1',
        student_name: 'Ali',
        guardian_email: 'p@example.com',
        guardian_phone: '0501111111',
        generated_content_en: 'Terms',
      },
      tenant: { name_en: 'School', jurisdiction_code: 'SA' },
    });

    expect(result.bothSucceeded).toBe(false);
    expect(result.email.success || result.whatsapp.success).toBe(false);
  });

  it('requires guardian email and phone', async () => {
    const result = await shareContractBothChannels(db.client as never, {
      tenantId: 'tenant-A',
      contract: { id: 'c1', guardian_email: '', guardian_phone: '050' },
    });
    expect(result.bothSucceeded).toBe(false);
    expect(result.email.error).toMatch(/email/i);
  });
});

describe('SCRUM-116/118 contractsRouter guards', () => {
  function user(role: string) {
    return { id: 'u1', email: 'a@school.sa', tenant_id: 'tenant-A', role };
  }
  function app(u: Record<string, unknown>) {
    const a = express();
    a.use(express.json());
    a.use(injectUser(u));
    a.use('/contracts', contractsRouter);
    return a;
  }

  it('denies parent from sharing contracts', async () => {
    const res = await request(app(user('parent'))).post('/contracts/c1/share').send({});
    expect(res.status).toBe(403);
  });

  it('denies parent from seeding templates', async () => {
    const res = await request(app(user('parent'))).post('/contracts/templates/seed-defaults').send({});
    expect(res.status).toBe(403);
  });

  it('allows admin past share guard (not 403)', async () => {
    db.setResolver(() => ({ data: null }));
    const res = await request(app(user('admin'))).post('/contracts/missing/share').send({});
    expect(res.status).not.toBe(403);
  });
});

describe('SCRUM-115 admissionsRouter notify guard', () => {
  function user(role: string) {
    return { id: 'u1', email: 'a@school.sa', tenant_id: 'tenant-A', role };
  }
  function app(u: Record<string, unknown>) {
    const a = express();
    a.use(express.json());
    a.use(injectUser(u));
    a.use('/admissions', admissionsRouter);
    return a;
  }

  it('denies teacher notifying parents', async () => {
    const res = await request(app(user('teacher')))
      .post('/admissions/applications/a1/notify')
      .send({ event: 'welcome' });
    expect(res.status).toBe(403);
  });

  it('allows admissions role past guard', async () => {
    db.setResolver(() => ({ data: null }));
    const res = await request(app(user('admissions')))
      .post('/admissions/applications/a1/notify')
      .send({ event: 'welcome' });
    expect(res.status).not.toBe(403);
  });
});

describe('SCRUM-113/114 publicIntakeRouter', () => {
  it('returns 404 for unknown link code', async () => {
    db.setResolver(() => ({ data: null }));
    const a = express();
    a.use(express.json());
    a.use('/public/intake', publicIntakeRouter);
    const res = await request(a).get('/public/intake/by-code/DOES-NOT-EXIST');
    expect(res.status).toBe(404);
  });

  it('rejects submit without required parent fields', async () => {
    db.setResolver((ctx) => {
      if (ctx.table === 'parent_intake_links' && ctx.single) {
        return {
          data: {
            id: 'link-1',
            tenant_id: 'tenant-A',
            link_code: 'INTAKE-1',
            is_active: true,
            academic_year: '2025-2026',
            branch_id: 'b1',
            allowed_grades: ['Grade1'],
            submission_count: 0,
          },
        };
      }
      if (ctx.table === 'tenants') {
        return { data: { id: 'tenant-A', name_en: 'School', status: 'active' } };
      }
      return { data: null };
    });

    const a = express();
    a.use(express.json());
    a.use('/public/intake', publicIntakeRouter);
    const res = await request(a).post('/public/intake/submit').send({
      link_code: 'INTAKE-1',
      student_name_ar: 'أحمد',
      // missing guardian bilingual + email + whatsapp
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_required_fields');
  });
});
