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
}

export interface Branch {
  id: string;
  jurisdictionCode: JurisdictionCode;
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
    .select('id, jurisdiction_code')
    .eq('id', tenantId)
    .single();
  if (tErr || !tenant) throw tErr ?? new JurisdictionUnresolvedError(tenantId, branchId);

  let branch: Branch | undefined;
  if (branchId) {
    const { data: b, error: bErr } = await supabase
      .from('branches')
      .select('id, jurisdiction_code')
      .eq('id', branchId)
      .single();
    if (!bErr && b) {
      branch = { id: b.id as string, jurisdictionCode: b.jurisdiction_code as string };
    }
  }

  return {
    tenant: { id: tenant.id as string, jurisdictionCode: tenant.jurisdiction_code as string },
    branch,
  };
}

/**
 * Validate that a jurisdiction code exists in the `jurisdictions` table.
 * Used in tenant/branch creation flows to fail fast on missing or unknown codes.
 */
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
