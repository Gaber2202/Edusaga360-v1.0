import { Router, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { buildRequestContext, resolveJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/jurisdiction/context
 *
 * Returns the resolved jurisdiction context for the authenticated tenant:
 *  - jurisdiction code
 *  - pack currency code
 *  - effective standard VAT rate (from jurisdiction_tax_rules, falling back to the pack)
 *  - enabled jurisdiction feature keys (used by JurisdictionFeatureProvider)
 *
 * This is the single backend source for the frontend's jurisdiction gating and
 * VAT-rate display; React code must not compare jurisdiction_code or hard-code
 * '15%' / '5%' / '0%'.
 */
router.get('/context', async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.tenant_id) {
      return res.status(403).json({ message: 'No tenant assigned to user' });
    }

    const branchId =
      typeof req.query.branch_id === 'string' && req.query.branch_id
        ? req.query.branch_id
        : undefined;

    const ctx = await buildRequestContext(supabase, req.user.tenant_id, branchId);
    const code = resolveJurisdiction(ctx);
    const pack = resolvePack(ctx);

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: featureRows }, { data: vatRow }] = await Promise.all([
      supabase
        .from('jurisdiction_features')
        .select('feature_key, enabled')
        .eq('jurisdiction_code', code),
      supabase
        .from('jurisdiction_tax_rules')
        .select('rate')
        .eq('jurisdiction_code', code)
        .eq('rule_type', 'vat_rate')
        .eq('category', 'standard')
        .lte('effective_from', today)
        .gte('effective_to', today)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const features = (featureRows ?? [])
      .filter((row) => row.enabled === true)
      .map((row) => row.feature_key as string);

    let vatRate: number | undefined;
    if (vatRow?.rate !== undefined && vatRow.rate !== null) {
      const n = typeof vatRow.rate === 'number' ? vatRow.rate : parseFloat(vatRow.rate);
      if (Number.isFinite(n) && n >= 0 && n <= 1) vatRate = n;
    }
    if (vatRate === undefined) {
      vatRate = pack.tax?.standardVatRate ?? 0;
    }

    return res.json({
      jurisdiction: code,
      currencyCode: pack.currencyCode,
      vatRate,
      features,
      localization: pack.localization ?? {
        currencyCode: pack.currencyCode,
        currencySymbol: { en: pack.currencyCode, ar: pack.currencyCode },
        minorUnits: 2,
        numberFormat: { locale: 'en-US', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
        dateFormat: { locale: 'en-US', options: { year: 'numeric', month: 'short', day: 'numeric' } },
        calendarSystems: ['gregorian'],
        textDirection: 'ltr',
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as jurisdictionRouter };
