/**
 * src/packs/qa/regulatorReports.ts
 *
 * Qatar regulator reporting adapters. No concrete report format is implemented
 * yet; MOEHE and Ministry of Labour portals have their own submission schemas.
 */

import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { RegulatorReportsService } from '../contract/CountryPack.js';

function stub(method: string) {
  return async (..._args: unknown[]) => {
    throw new NotImplementedInJurisdiction(
      'QA',
      `RegulatorReportsService.${method} — Qatar regulator report not implemented; numeric Qatarisation quota is not published`,
    );
  };
}

export const qaRegulatorReports: RegulatorReportsService = {
  calculateNitaqat: stub('calculateNitaqat'),
  calculateVatReturn: stub('calculateVatReturn'),
  generateMHRSDReport: stub('generateMHRSDReport'),
};
