import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Opaque type for jurisdiction codes (e.g. 'SA', 'AE', 'QA').
 * The set of known codes is defined in the `jurisdictions` table and should be
 * checked at creation/usage time through `validateJurisdictionCode`.
 */
export type JurisdictionCode = string;

export interface Tenant {
  id: string;
  jurisdictionCode: JurisdictionCode;
  settings?: Record<string, unknown>;
}

export interface Branch {
  id: string;
  jurisdictionCode: JurisdictionCode;
  settings?: Record<string, unknown>;
}

export interface RequestContext {
  tenant: Tenant;
  branch?: Branch;
}

/**
 * Thrown when a jurisdiction cannot be resolved from the request context.
 * This means neither the branch nor the tenant has a jurisdiction code set.
 */
export class JurisdictionUnresolvedError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
  ) {
    super(
      `Jurisdiction could not be resolved for tenant ${tenantId}${
        branchId ? `, branch ${branchId}` : ''
      }.`,
    );
    this.name = 'JurisdictionUnresolvedError';
  }
}

/**
 * Thrown when a feature is not implemented for a resolved jurisdiction.
 */
export class NotImplementedInJurisdiction extends Error {
  constructor(
    public readonly jurisdiction: JurisdictionCode,
    public readonly feature: string,
  ) {
    super(`${feature} is not implemented for jurisdiction ${jurisdiction}.`);
    this.name = 'NotImplementedInJurisdiction';
  }
}

/**
 * Resolve jurisdiction from the request context.
 *
 * RULES:
 * - Branch jurisdiction wins if the branch is present and has a code.
 * - Otherwise fall back to the tenant jurisdiction.
 * - If neither is set, throw JurisdictionUnresolvedError.
 *
 * This is the ONLY function that resolves jurisdiction. Callers must never read
 * `tenant.jurisdictionCode` or `branch.jurisdictionCode` directly; use this helper.
 */
export interface JurisdictionScope {
  /** Effective jurisdiction code for the scope (tenant fallback when mixed). */
  code: JurisdictionCode;
  /** True if the scope contains more than one jurisdiction (e.g. cross-border group with no branch selected). */
  isMixed: boolean;
  /** Distinct jurisdiction codes found in the scope. */
  branchCodes: JurisdictionCode[];
}

const SA: JurisdictionCode = 'SA';

/**
 * True when the resolved scope represents a single Saudi jurisdiction.
 * Prefer this helper to inline country-code checks outside the pack layer.
 */
export function isSaudiScope(scope: JurisdictionScope): boolean {
  return !scope.isMixed && scope.code === SA;
}

/**
 * Determine the jurisdiction scope for a tenant + optional branch.
 * - A specific branch resolves to that branch's code.
 * - No branch resolves to all branch codes; if they differ, the scope is mixed.
 */
export async function resolveScopeJurisdiction(
  supabase: SupabaseClient,
  tenantId: string,
  branchId?: string,
): Promise<JurisdictionScope> {
  const [{ data: tenant }, { data: branches }] = await Promise.all([
    supabase.from('tenants').select('jurisdiction_code').eq('id', tenantId).single(),
    supabase.from('branches').select('id, jurisdiction_code').eq('tenant_id', tenantId),
  ]);

  const branchCodeById = new Map<string, JurisdictionCode>();
  for (const b of (branches ?? [])) {
    if (b.jurisdiction_code) branchCodeById.set(b.id as string, b.jurisdiction_code as string);
  }

  if (branchId) {
    const code = branchCodeById.get(branchId) ?? (tenant?.jurisdiction_code as JurisdictionCode);
    return { code, isMixed: false, branchCodes: [code].filter(Boolean) };
  }

  const codes = [...new Set([...(tenant?.jurisdiction_code ? [tenant.jurisdiction_code] : []), ...branchCodeById.values()])].filter(Boolean);
  const isMixed = codes.length > 1;
  const code = isMixed ? (tenant?.jurisdiction_code as JurisdictionCode) : codes[0];
  return { code, isMixed, branchCodes: codes };
}

export function resolveJurisdiction(ctx: RequestContext): JurisdictionCode {
  const raw = ctx.branch?.jurisdictionCode;
  if (raw === '') {
    throw new JurisdictionUnresolvedError(ctx.tenant.id, ctx.branch?.id);
  }
  const code = raw ?? ctx.tenant.jurisdictionCode;
  if (!code) {
    throw new JurisdictionUnresolvedError(
      ctx.tenant.id,
      ctx.branch?.id,
    );
  }
  return code;
}

/**
 * Build a `RequestContext` from tenant/branch identifiers by reading the
 * corresponding `jurisdiction_code` values from the database. This is the
 * only helper that performs the database read; callers then pass the returned
 * context to `resolveJurisdiction()` or `resolvePack()`.
 */
export async function buildRequestContext(
  supabase: SupabaseClient,
  tenantId: string,
  branchId?: string,
): Promise<RequestContext> {
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, jurisdiction_code, settings')
    .eq('id', tenantId)
    .single();
  if (tErr || !tenant) throw tErr ?? new JurisdictionUnresolvedError(tenantId, branchId);

  let branch: Branch | undefined;
  if (branchId) {
    const { data: b, error: bErr } = await supabase
      .from('branches')
      .select('id, jurisdiction_code, settings')
      .eq('id', branchId)
      .single();
    if (!bErr && b) {
      branch = {
        id: b.id as string,
        jurisdictionCode: b.jurisdiction_code as string,
        settings: (b.settings ?? {}) as Record<string, unknown>,
      };
    }
  }

  return {
    tenant: {
      id: tenant.id as string,
      jurisdictionCode: tenant.jurisdiction_code as string,
      settings: (tenant.settings ?? {}) as Record<string, unknown>,
    },
    branch,
  };
}

/**
 * Validate that a jurisdiction code exists in the `jurisdictions` table.
 * Used in tenant/branch creation flows to fail fast on missing or unknown codes.
 */
/**
 * Check whether a jurisdiction feature is enabled in `jurisdiction_features`.
 * Missing rows are treated as disabled. This is the canonical gate for
 * jurisdiction capabilities; callers should prefer this over country-code
 * comparisons.
 */
export async function isFeatureEnabled(
  ctx: RequestContext,
  supabase: SupabaseClient,
  featureKey: string,
): Promise<boolean> {
  const code = resolveJurisdiction(ctx);
  const { data, error } = await supabase
    .from('jurisdiction_features')
    .select('enabled')
    .eq('jurisdiction_code', code)
    .eq('feature_key', featureKey)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export async function validateJurisdictionCode(
  supabase: SupabaseClient,
  code: JurisdictionCode,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('jurisdictions')
    .select('code')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
