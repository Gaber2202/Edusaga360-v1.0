/**
 * src/packs/ae/regulatorReports.ts
 *
 * UAE emirate-level regulator reporting adapters. No concrete report format is
 * implemented yet; each emirate (ADEK, KHDA, SPEA, RAK DOK) has its own
 * submission portal and schema.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { RegulatorReportsService } from '../contract/CountryPack.js';

function stub(method: string) {
  return async (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'AE',
      `RegulatorReportsService.${method} — UAE emirate-level regulator report not implemented`,
    );
  };
}

export const aeRegulatorReports: RegulatorReportsService = {
  calculateNitaqat: stub('calculateNitaqat'),
  calculateVatReturn: stub('calculateVatReturn'),
  generateMHRSDReport: stub('generateMHRSDReport'),
};
