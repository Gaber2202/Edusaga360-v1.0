/**
 * src/lib/localisation.ts
 *
 * Branch/tenant-aware locale and weekend resolution. The pack supplies the
 * jurisdiction default; tenant.settings or branch.settings can override it.
 */

import type { RequestContext } from './jurisdiction.js';
import type { CountryPack } from '../packs/contract/CountryPack.js';

function getSetting(
  ctx: RequestContext,
  key: 'locale' | 'weekend',
): unknown {
  const branchValue = ctx.branch?.settings?.[key];
  if (branchValue !== undefined) return branchValue;
  return ctx.tenant.settings?.[key];
}

/** Resolve the effective locale for a request: branch → tenant → pack default. */
export function resolveLocale(ctx: RequestContext, pack: CountryPack): string {
  const configured = getSetting(ctx, 'locale');
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return pack.localisation?.getDefaultLocale?.() ?? 'en-US';
}

/** Resolve the effective weekend days for a request: branch → tenant → pack default. */
export function resolveWeekend(ctx: RequestContext, pack: CountryPack): number[] {
  const configured = getSetting(ctx, 'weekend');
  if (Array.isArray(configured)) return configured as number[];
  return pack.localisation?.getDefaultWeekend?.() ?? [0, 6];
}
