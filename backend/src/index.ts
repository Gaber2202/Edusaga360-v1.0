import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { supabase } from './lib/supabase.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { mfaRouter } from './routes/mfa.js';
import { journalEntryRouter } from './routes/journalEntries.js';
import { tenantRequestRouter } from './routes/tenantRequests.js';
import { registrationRouter } from './routes/registration.js';
import { invoiceRouter } from './routes/invoices.js';
import { aiRouter } from './routes/ai.js';
import { feesRouter } from './routes/fees.js';
import { payrollRouter } from './routes/payroll.js';
import { payslipPdfRouter } from './routes/payslipPdf.js';
import { attendancePolicyRouter } from './routes/attendancePolicy.js';
import { leaveRouter } from './routes/leave.js';
import { notificationsRouter } from './routes/notifications.js';
import { benchmarksRouter } from './routes/benchmarks.js';
import { marketplaceRouter } from './routes/marketplace.js';
import { tenantUsersRouter } from './routes/tenantUsers.js';
import { adminRouter } from './routes/admin.js';
import { billingRouter } from './routes/billing.js';
import { chequeRouter } from './routes/cheques.js';
import { parentsRouter } from './routes/parents.js';
import { filesRouter } from './routes/files.js';
import { execRouter } from './routes/exec.js';
import { subscriptionRouter } from './routes/subscription.js';
import { subscriptionPublicRouter } from './routes/subscriptionPublic.js';
import { intakeRouter } from './routes/intake.js';
import { apiKeysRouter } from './routes/apiKeys.js';
import { apiKeyAuth } from './middleware/apiKeyAuth.js';
import { externalApiRouter } from './routes/external/v1.js';
import { atsRouter } from './routes/ats.js';
import { emailConnectorsRouter } from './routes/emailConnectors.js';
import { messagingRouter } from './routes/messaging.js';
import { collectionsRouter } from './routes/collections.js';
import { billingPublicRouter } from './routes/billingPublic.js';
import { messagingPublicRouter } from './routes/messagingPublic.js';
import { infobipWebhookRouter } from './routes/infobipWebhooks.js';
import cron from 'node-cron';
import { SegmentationRunner } from './services/collections/runner.js';
import { CollectionMessenger } from './services/collections/messenger.js';
import { InstallmentPlanEngine } from './services/collections/installments.js';
import { GuaranteeEngine } from './services/collections/guarantee.js';
import { reconcileMoyasarState } from './services/moyasar/moyasarService.js';
import { MetricsService } from './services/metrics.js';

dotenv.config();

// ── Startup environment checks ────────────────────────────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const MISSING = REQUIRED_ENV.filter(k => !process.env[k]);
if (MISSING.length) {
  console.error(`[startup] FATAL: missing required env vars: ${MISSING.join(', ')}`);
  process.exit(1);
}
if (!process.env.ADMIN_LINK_SECRET || process.env.ADMIN_LINK_SECRET === 'change-me-in-production') {
  console.error('[startup] FATAL: ADMIN_LINK_SECRET is not set or is using the default value. Set a strong random secret in Railway env vars.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

// ── External Integration API (/api/v1) ────────────────────────────────────────
// Server-to-server surface for third-party / legacy / ATS / email integrations.
// Authenticated by tenant-scoped API keys (NOT Supabase JWTs) and deliberately
// mounted BEFORE the first-party browser CORS wall below: external callers are
// not bound by the origin allow-list. It gets its own open CORS, JSON parser and
// rate limiter, and each key is tenant-scoped and scope-gated inside the router.
const externalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests, slow down.' },
});
app.use(
  '/api/v1',
  cors({ origin: true }),
  express.json({ limit: '256kb' }),
  externalApiLimiter,
  apiKeyAuth,
  externalApiRouter,
);

// CORS — explicit list + Vercel preview pattern
const allowedOrigins = [
  'https://edusaga-360-production.vercel.app',
  'https://edusaga-360.vercel.app',
  'https://platform.edusaga360.com',
  'https://admin.edusaga360.com',
  'https://parentportal.edusaga360.com',
  'https://edusaga-360-admin-portal.vercel.app',
  'https://edusaga-360-parent-portal.vercel.app',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : []),
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow all Vercel preview deployments for EduSaga 360
    if (/^https:\/\/edusaga-360[a-z0-9-]*\.vercel\.app$/.test(origin)) return callback(null, true);
    if (/^https:\/\/edusaga-360[a-z0-9-]*-edusaga360s-projects\.vercel\.app$/.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Structured request logging — strips query strings to avoid leaking tokens
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: { write: (msg) => process.stdout.write(msg.replace(/\?[^\s]+/, '?[redacted]')) },
}));

// Reduce body limit from 10mb to 256kb — enough for any API call
app.use(express.json({ limit: '256kb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────────

// Strict limit for public registration — prevents spam and email enumeration
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later.' },
});

// Moderate global limit for all authenticated API calls
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public routes (no auth required) ──────────────────────────────────────────
app.use('/api/health', healthRouter);
// MFA routes are authenticated but mounted under /api/auth for a consistent namespace.
app.use('/api/auth/mfa', apiLimiter, authMiddleware, mfaRouter);
app.use('/api/auth', authRouter);
app.use('/api/registration', registrationLimiter, registrationRouter);
// Moyasar server-to-server webhook — verified by shared secret, not JWT.
app.use('/api/public/billing', billingPublicRouter);
// Meta / Infobip inbound messaging webhooks — verified by provider signature/tokens at handler level.
app.use('/api/public/messaging', messagingPublicRouter);
// Infobip delivery-receipt webhook — verified by INFOBIP_WEBHOOK_SECRET if configured.
app.use('/api/webhooks/infobip', infobipWebhookRouter);

// ── Authenticated routes — ALL protected by authMiddleware + tenantMiddleware ──
// IMPORTANT: Register middleware on each router directly.
// app.use('/api', middleware) does NOT apply to separately mounted routers.
app.use('/api/journal-entries', apiLimiter, authMiddleware, tenantMiddleware, journalEntryRouter);
app.use('/api/tenant-requests', apiLimiter, authMiddleware, tenantMiddleware, tenantRequestRouter);
app.use('/api/invoices',        apiLimiter, authMiddleware, tenantMiddleware, invoiceRouter);
app.use('/api/fees',            apiLimiter, authMiddleware, tenantMiddleware, feesRouter);
app.use('/api/billing',         apiLimiter, authMiddleware, tenantMiddleware, billingRouter);
app.use('/api/cheques',         apiLimiter, authMiddleware, tenantMiddleware, chequeRouter);
app.use('/api/payroll',             apiLimiter, authMiddleware, tenantMiddleware, payrollRouter);
app.use('/api/payroll',             apiLimiter, authMiddleware, tenantMiddleware, payslipPdfRouter);
app.use('/api/attendance-policy',   apiLimiter, authMiddleware, tenantMiddleware, attendancePolicyRouter);
app.use('/api/leave',               apiLimiter, authMiddleware, tenantMiddleware, leaveRouter);
app.use('/api/notifications',       apiLimiter, authMiddleware, tenantMiddleware, notificationsRouter);
app.use('/api/benchmarks',          apiLimiter, authMiddleware, tenantMiddleware, benchmarksRouter);
app.use('/api/marketplace',         apiLimiter, authMiddleware, tenantMiddleware, marketplaceRouter);
app.use('/api/tenant-users',        apiLimiter, authMiddleware, tenantMiddleware, tenantUsersRouter);
app.use('/api/subscription',        apiLimiter, subscriptionPublicRouter);
app.use('/api/ai',                  apiLimiter, authMiddleware, tenantMiddleware, aiRouter);
app.use('/api/admin',               apiLimiter, authMiddleware, adminRouter);
app.use('/api/parents',             apiLimiter, authMiddleware, tenantMiddleware, parentsRouter);
app.use('/api/files',               apiLimiter, authMiddleware, tenantMiddleware, filesRouter);
app.use('/api/exec',                apiLimiter, authMiddleware, tenantMiddleware, execRouter);
app.use('/api/subscription',        apiLimiter, authMiddleware, tenantMiddleware, subscriptionRouter);
app.use('/api/intake',              apiLimiter, authMiddleware, tenantMiddleware, intakeRouter);
// API key management (control plane for the external /api/v1 data plane above).
app.use('/api/api-keys',            apiLimiter, authMiddleware, tenantMiddleware, apiKeysRouter);
// ATS integration — connect/sync an external Applicant Tracking System into HR.
app.use('/api/ats',                 apiLimiter, authMiddleware, tenantMiddleware, atsRouter);
// Email integration — connect a school mailbox for outbound send + inbound sync.
app.use('/api/email',               apiLimiter, authMiddleware, tenantMiddleware, emailConnectorsRouter);
// Messaging integration — connect an SMS / WhatsApp gateway for notifications.
app.use('/api/messaging',           apiLimiter, authMiddleware, tenantMiddleware, messagingRouter);
// YAMEN AI Collections Agent — finance console, segmentation, approval queue.
app.use('/api/collections',         apiLimiter, collectionsRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  },
);

app.listen(PORT, () => {
  console.log(`EduSaga 360 API server running on port ${PORT}`);
  const callbackUrl = `${process.env.FRONTEND_URL ?? 'https://parentportal.edusaga360.com'}/payment/complete`;

  if (process.env.COLLECTIONS_CRON_ENABLED === 'true') {
    // Nightly YAMEN collections job (01:00 KSA): segment, then enqueue reminders.
    cron.schedule(
      '0 1 * * *',
      async () => {
        try {
          const runner = new SegmentationRunner(supabase);
          const messenger = new CollectionMessenger(supabase, callbackUrl);
          const installmentEngine = new InstallmentPlanEngine(supabase);
          const guaranteeEngine = new GuaranteeEngine(supabase);
          const { data: settings } = await supabase
            .from('collection_settings')
            .select('tenant_id')
            .eq('is_enabled', true)
            .is('kill_switch_activated_at', null);
          for (const row of settings ?? []) {
            try {
              const segResult = await runner.runForTenant(row.tenant_id);
              const enqueueResult = await messenger.enqueueRemindersForTenant(row.tenant_id);
              const brokenResult = await installmentEngine.detectBrokenPlans(row.tenant_id);
              const measureResult = await guaranteeEngine.recordMeasurement(row.tenant_id);
              console.log(`[cron] collections completed for ${row.tenant_id}:`, { segResult, enqueueResult, brokenResult, measureResult });
            } catch (err) {
              console.error(`[cron] collections failed for ${row.tenant_id}:`, err);
            }
          }
        } catch (err) {
          console.error('[cron] nightly collections failed:', err);
        }
      },
      { timezone: 'Asia/Riyadh' },
    );

    // Send pending messages every 5 minutes within the tenant send window.
    cron.schedule('*/5 * * * *', async () => {
      try {
        const messenger = new CollectionMessenger(supabase, callbackUrl);
        const result = await messenger.sendPendingMessages(100);
        console.log('[cron] send pending messages:', result);
      } catch (err) {
        console.error('[cron] send pending messages failed:', err);
      }
    });

    console.log('[cron] collections jobs scheduled (segmentation 01:00 KSA, sends every 5 min)');
  }

  if (process.env.MOYASAR_RECONCILE_ENABLED === 'true') {
    // Moyasar reconciliation sweep every 15 minutes.
    cron.schedule('*/15 * * * *', async () => {
      try {
        const { data: tenants } = await supabase
          .from('tenant_compliance_settings')
          .select('tenant_id')
          .eq('moyasar_enabled', true);
        for (const t of tenants ?? []) {
          try {
            const report = await reconcileMoyasarState(supabase, t.tenant_id as string);
            console.log(`[cron] moyasar reconcile ${t.tenant_id}:`, report);
          } catch (err) {
            console.error(`[cron] moyasar reconcile failed for ${t.tenant_id}:`, err);
          }
        }
      } catch (err) {
        console.error('[cron] moyasar reconcile sweep failed:', err);
      }
    });
    console.log('[cron] Moyasar reconciliation sweep scheduled every 15 min');
  }

  // Nightly KPI snapshot materialization (02:00 KSA) for the Executive Command Center.
  cron.schedule(
    '0 2 * * *',
    async () => {
      try {
        const metrics = new MetricsService(supabase);
        const { data: tenants } = await supabase.from('tenants').select('id');
        for (const t of tenants ?? []) {
          try {
            await metrics.computeAndStoreAll(t.id as string, 'current');
            console.log(`[cron] kpi snapshots completed for ${t.id}`);
          } catch (err) {
            console.error(`[cron] kpi snapshots failed for ${t.id}:`, err);
          }
        }
      } catch (err) {
        console.error('[cron] nightly kpi snapshots failed:', err);
      }
    },
    { timezone: 'Asia/Riyadh' },
  );
  console.log('[cron] KPI snapshots scheduled every night at 02:00 KSA');
});

export default app;
