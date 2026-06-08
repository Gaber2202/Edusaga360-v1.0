import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
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
import { parentsRouter } from './routes/parents.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

// CORS — explicit list only, no localhost fallback in production
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

app.use(cors({ origin: allowedOrigins, credentials: true }));

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
app.use('/api/auth', authRouter);
app.use('/api/registration', registrationLimiter, registrationRouter);

// ── Authenticated routes — ALL protected by authMiddleware + tenantMiddleware ──
// IMPORTANT: Register middleware on each router directly.
// app.use('/api', middleware) does NOT apply to separately mounted routers.
app.use('/api/journal-entries', apiLimiter, authMiddleware, tenantMiddleware, journalEntryRouter);
app.use('/api/tenant-requests', apiLimiter, authMiddleware, tenantMiddleware, tenantRequestRouter);
app.use('/api/invoices',        apiLimiter, authMiddleware, tenantMiddleware, invoiceRouter);
app.use('/api/fees',            apiLimiter, authMiddleware, tenantMiddleware, feesRouter);
app.use('/api/billing',         apiLimiter, authMiddleware, tenantMiddleware, billingRouter);
app.use('/api/payroll',             apiLimiter, authMiddleware, tenantMiddleware, payrollRouter);
app.use('/api/payroll',             apiLimiter, authMiddleware, tenantMiddleware, payslipPdfRouter);
app.use('/api/attendance-policy',   apiLimiter, authMiddleware, tenantMiddleware, attendancePolicyRouter);
app.use('/api/leave',               apiLimiter, authMiddleware, tenantMiddleware, leaveRouter);
app.use('/api/notifications',       apiLimiter, authMiddleware, tenantMiddleware, notificationsRouter);
app.use('/api/benchmarks',          apiLimiter, authMiddleware, tenantMiddleware, benchmarksRouter);
app.use('/api/marketplace',         apiLimiter, authMiddleware, tenantMiddleware, marketplaceRouter);
app.use('/api/tenant-users',        apiLimiter, authMiddleware, tenantMiddleware, tenantUsersRouter);
app.use('/api/ai',                  apiLimiter, authMiddleware, tenantMiddleware, aiRouter);
app.use('/api/admin',               apiLimiter, authMiddleware, adminRouter);
app.use('/api/parents',             apiLimiter, authMiddleware, tenantMiddleware, parentsRouter);

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
});

export default app;
