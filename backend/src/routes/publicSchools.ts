import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { findListedSchool, publicSchoolPayload, SCHOOL_NOT_FOUND } from '../lib/parentSchool.js';

export const publicSchoolsRouter = Router();

const schoolLookupLimiter = process.env.VITEST
  ? ((_req: Request, _res: Response, next: NextFunction) => next())
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many requests, please try again later.' },
    });

publicSchoolsRouter.use(schoolLookupLimiter);

function notFound(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  return res.status(404).json({ message: SCHOOL_NOT_FOUND });
}

publicSchoolsRouter.get('/by-code/:tenant_code', async (req, res) => {
  const school = await findListedSchool({ tenantCode: String(req.params.tenant_code || '') });
  if (!school) return notFound(res);
  return res.json(publicSchoolPayload(school));
});

publicSchoolsRouter.get('/by-slug/:slug', async (req, res) => {
  const school = await findListedSchool({ slug: String(req.params.slug || '') });
  if (!school) return notFound(res);
  return res.json(publicSchoolPayload(school));
});
