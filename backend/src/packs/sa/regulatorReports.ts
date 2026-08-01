/**
 * src/packs/sa/regulatorReports.ts
 *
 * Saudi regulator reports adapter. Nitaqat/Saudization is delegated to
 * MetricsService; VAT return and MHRSD reports are not yet standalone backend
 * capabilities and are left as typed TODOs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MetricsService } from '../../services/metrics.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { RegulatorReportsService } from '../contract/CountryPack.js';

export const saRegulatorReports: RegulatorReportsService = {
  calculateNitaqat: async (supabase: SupabaseClient, tenantId: string) => {
    const dashboard = await new MetricsService(supabase).getDashboard('chro', tenantId);
    return {
      band: dashboard?.nitaqat?.band,
      saudizationPct: dashboard?.nitaqat?.saudization_pct,
      workforceComposition: dashboard?.workforce_composition,
    };
  },

  calculateVatReturn: async () => {
    throw new NotImplementedInJurisdiction('SA', 'RegulatorReportsService.calculateVatReturn — see ADR-006 / Task 8b');
  },

  generateMHRSDReport: async () => {
    throw new NotImplementedInJurisdiction('SA', 'RegulatorReportsService.generateMHRSDReport — see ADR-006 / Task 8b');
  },
};
