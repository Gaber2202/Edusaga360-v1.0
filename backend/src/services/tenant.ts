import { supabase } from '../lib/supabase.js';
import type { TenantData } from '../types/tenant.js';

/**
 * Load the tenant compliance profile used for ZATCA/PDF rendering.
 *
 * Reads `tenant_compliance_settings` first, then falls back to legacy
 * `tenants.settings` JSONB and `tenants` base columns.
 */
export async function getTenantComplianceData(tenant_id: string): Promise<TenantData> {
  const [{ data: compliance }, { data: tenant }] = await Promise.all([
    supabase.from('tenant_compliance_settings').select('*').eq('tenant_id', tenant_id).maybeSingle(),
    supabase.from('tenants').select('id, name_en, name_ar, admin_email, city, logo_url, settings').eq('id', tenant_id).single(),
  ]);

  if (!tenant) return {};
  const settings = (tenant.settings as Record<string, string>) ?? {};

  return {
    id: tenant.id,
    name: compliance?.legal_name_en || tenant.name_en,
    name_ar: compliance?.legal_name_ar || tenant.name_ar,
    legal_name_en: compliance?.legal_name_en || tenant.name_en,
    legal_name_ar: compliance?.legal_name_ar || tenant.name_ar,
    vat_number: compliance?.vat_trn || settings.vat_number || '',
    address: compliance?.address_en || settings.address || tenant.city || '',
    address_ar: compliance?.address_ar || settings.address_ar || tenant.city || '',
    address_en: compliance?.address_en || settings.address || tenant.city || '',
    city: compliance?.city || tenant.city || '',
    country_code: compliance?.country_code || 'SA',
    country_subentity_code: compliance?.country_subentity_code || 'SA-01',
    phone: compliance?.phone || settings.phone || '',
    email: compliance?.email || tenant.admin_email || '',
    cr_number: compliance?.cr_number || settings.cr_number || '',
    logo_url: compliance?.logo_url || tenant.logo_url || '',
  };
}
