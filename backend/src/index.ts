import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { authMiddleware } from './middleware/auth.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { journalEntryRouter } from './routes/journalEntries.js';
import { tenantRequestRouter } from './routes/tenantRequests.js';
import { registrationRouter } from './routes/registration.js';

import { aiRouter } from './routes/ai.js';
import { feesRouter } from './routes/fees.js';
import { payrollRouter } from './routes/payroll.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://edusaga-360-production.vercel.app',
    'https://edusaga-360.vercel.app',
    'https://platform.edusaga360.com',
    'https://admin.edusaga360.com',
    'https://parentportal.edusaga360.com',
    'https://edusaga-360-admin-portal.vercel.app',
    'https://edusaga-360-parent-portal.vercel.app',
  ].filter(Boolean),
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Public routes (no auth required)
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/registration', registrationRouter);

// Authenticated routes
app.use('/api', authMiddleware, tenantMiddleware);
app.use('/api/journal-entries', journalEntryRouter);
app.use('/api/tenant-requests', tenantRequestRouter);

app.use('/api/ai', aiRouter);
app.use('/api/fees', feesRouter);
app.use('/api/payroll', payrollRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
  },
);

app.listen(PORT, () => {
  console.log(`EduSaga 360 API server running on port ${PORT}`);
});

export default app;
