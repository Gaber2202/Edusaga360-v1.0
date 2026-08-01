/**
 * src/packs/sa/feeGovernance.ts
 *
 * Saudi fee governance. Discount rule application is delegated to the existing
 * billing route helper; fee-structure resolution is not yet a standalone
 * backend capability.
 */

import { applyDiscounts } from '../../routes/billing.js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { FeeGovernanceService } from '../contract/CountryPack.js';

export const saFeeGovernance: FeeGovernanceService = {
  resolveFeeStructures: async () => {
    throw new NotImplementedInJurisdiction('SA', 'FeeGovernanceService.resolveFeeStructures — see ADR-006 / Task 8b');
  },

  applyDiscounts: async (
    _supabase,
    tenantId: string,
    input: {
      studentId: string;
      academicYear: string;
      subtotal: number;
      categoryId?: string;
    },
  ) => applyDiscounts(tenantId, input.studentId, input.academicYear, input.subtotal, input.categoryId),
};
