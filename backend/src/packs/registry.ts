/**
 * src/packs/registry.ts
 *
 * Resolve a country pack from a request context. Domain code depends on the
 * interface only (CountryPack) and never on `packs/sa` directly.
 */

import {
  resolveJurisdiction,
  NotImplementedInJurisdiction,
  type RequestContext,
} from '../lib/jurisdiction.js';
import type { CountryPack } from './contract/CountryPack.js';
import { saPack } from './sa/index.js';

const registry = new Map<string, CountryPack>([['SA', saPack]]);

/**
 * Resolve the CountryPack for the current request context.
 *
 * - Uses `resolveJurisdiction()` to get the jurisdiction code.
 * - Returns the matching pack.
 * - Throws `NotImplementedInJurisdiction` for jurisdictions without a pack.
 */
export function resolvePack(ctx: RequestContext): CountryPack {
  const code = resolveJurisdiction(ctx);
  const pack = registry.get(code);
  if (!pack) {
    throw new NotImplementedInJurisdiction(code, 'CountryPack');
  }
  return pack;
}
