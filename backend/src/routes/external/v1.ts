/**
 * External Integration API — /api/v1
 *
 * The public, versioned data plane for third-party systems (legacy SIS/HR
 * migration, ATS / LinkedIn, email, etc.). Every request here is authenticated
 * by a tenant-scoped API key (see middleware/apiKeyAuth.ts) and authorized by an
 * explicit scope. The tenant is ALWAYS taken from the key, never from the body
 * or query, so a key cannot address another tenant's data.
 *
 * This module wires the meta endpoints and mounts one router per resource. Add a
 * resource by: declaring its scope(s) in lib/apiScopes.ts, creating a
 * routes/external/<resource>.ts router that gates each handler with
 * requireScope(...) and scopes every query by req.apiClient.tenantId, then
 * mounting it below. Follow the students read + idempotent-write shape.
 */
import { Router, Response } from 'express';
import { ApiKeyRequest } from '../../middleware/apiKeyAuth.js';
import { studentsRouter } from './students.js';
import { staffRouter } from './staff.js';
import { guardiansRouter } from './guardians.js';
import { invoicesRouter } from './invoices.js';
import { importRouter } from './import.js';
import { webhooksRouter } from './webhooks.js';

export const externalApiRouter = Router();

// ─── Meta ─────────────────────────────────────────────────────────────────────

// GET /api/v1/ping — liveness + "is my key valid" check. No scope required, so
// integrators can verify credentials before requesting any data scope.
externalApiRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'edusaga-external-api', version: 'v1' });
});

// GET /api/v1/whoami — echo the identity the key resolves to.
externalApiRouter.get('/whoami', (req: ApiKeyRequest, res: Response) => {
  res.json({ tenant_id: req.apiClient!.tenantId, scopes: req.apiClient!.scopes });
});

// ─── Resources ────────────────────────────────────────────────────────────────
externalApiRouter.use('/students', studentsRouter);
externalApiRouter.use('/staff', staffRouter);
externalApiRouter.use('/guardians', guardiansRouter);
externalApiRouter.use('/invoices', invoicesRouter);
externalApiRouter.use('/import', importRouter);
externalApiRouter.use('/webhooks', webhooksRouter);
