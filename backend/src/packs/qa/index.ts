/**
 * src/packs/qa/index.ts
 *
 * Qatar (State of Qatar) country pack.
 */

import type { CountryPack } from '../contract/CountryPack.js';
import { qaAcademicCalendar } from './academicCalendar.js';
import { qaDocuments } from './documents.js';
import { qaEInvoice } from './eInvoice.js';
import { qaFeeGovernance } from './feeGovernance.js';
import { qaGovIntegrations } from './govIntegrations.js';
import { qaIdentity } from './identity.js';
import { qaLocalisation, qaLocalization } from './localisation.js';
import { qaPayments } from './payments.js';
import { qaPayroll } from './payroll.js';
import { qaRegulatorReports } from './regulatorReports.js';
import { qaTax } from './tax.js';

export const qaPack: CountryPack = {
  code: 'QA',
  currencyCode: 'QAR',
  tax: qaTax,
  eInvoice: qaEInvoice,
  payments: qaPayments,
  identity: qaIdentity,
  payroll: qaPayroll,
  govIntegrations: qaGovIntegrations,
  regulatorReports: qaRegulatorReports,
  academicCalendar: qaAcademicCalendar,
  feeGovernance: qaFeeGovernance,
  documents: qaDocuments,
  localisation: qaLocalisation,
  localization: qaLocalization,
};
