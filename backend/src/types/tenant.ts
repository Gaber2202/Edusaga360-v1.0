/**
 * src/types/tenant.ts
 *
 * Shared tenant data shape used for invoice/PDF rendering and compliance.
 * This is jurisdiction-neutral; implementations in country packs supply
 * jurisdiction-specific values at runtime.
 */
export interface TenantData {
  id?: string;
  name?: string;
  name_ar?: string;
  legal_name_en?: string;
  legal_name_ar?: string;
  vat_number?: string;
  address?: string;
  address_ar?: string;
  address_en?: string;
  city?: string;
  country_code?: string;
  country_subentity_code?: string;
  phone?: string;
  email?: string;
  cr_number?: string;
  logo_url?: string;
}
