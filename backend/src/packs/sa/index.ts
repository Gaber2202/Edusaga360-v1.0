/**
 * src/packs/sa/index.ts
 *
 * Saudi Arabia (KSA) country pack. Step 3 wiring: all backend-resident
 * capabilities are delegated to existing modules; Category A/B documents and
 * route-bound payroll/fee-governance pieces are left as typed TODOs per
 * ADR-006 and Task 8b.
 */

import type { CountryPack } from '../contract/CountryPack.js';
import { saTax } from './tax.js';
import { saEInvoice } from './eInvoice.js';
import { saPayments } from './payments.js';
import { saIdentity } from './identity.js';
import { saPayroll } from './payroll.js';
import { saGovIntegrations } from './govIntegrations.js';
import { saRegulatorReports } from './regulatorReports.js';
import { saAcademicCalendar } from './academicCalendar.js';
import { saFeeGovernance } from './feeGovernance.js';
import { saDocuments } from './documents.js';
import { saLocalisation } from './localisation.js';

export const saPack: CountryPack = {
  code: 'SA',
  currencyCode: 'SAR',
  tax: saTax,
  eInvoice: saEInvoice,
  payments: saPayments,
  identity: saIdentity,
  payroll: saPayroll,
  govIntegrations: saGovIntegrations,
  regulatorReports: saRegulatorReports,
  academicCalendar: saAcademicCalendar,
  feeGovernance: saFeeGovernance,
  documents: saDocuments,
  localisation: saLocalisation,
};

export default saPack;
