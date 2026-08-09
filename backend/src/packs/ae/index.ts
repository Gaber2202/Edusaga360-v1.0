import type { CountryPack } from '../contract/CountryPack.js';
import { aeAcademicCalendar } from './academicCalendar.js';
import { aeDocuments } from './documents.js';
import { aeEInvoice } from './eInvoice.js';
import { aeFeeGovernance } from './feeGovernance.js';
import { aeGovIntegrations } from './govIntegrations.js';
import { aeIdentity } from './identity.js';
import { aeLocalisation, aeLocalization } from './localisation.js';
import { aePayments } from './payments.js';
import { aePayroll } from './payroll.js';
import { aeRegulatorReports } from './regulatorReports.js';
import { aeTax } from './tax.js';

export const aePack: CountryPack = {
  code: 'AE',
  currencyCode: 'AED',
  tax: aeTax,
  eInvoice: aeEInvoice,
  payments: aePayments,
  identity: aeIdentity,
  payroll: aePayroll,
  govIntegrations: aeGovIntegrations,
  regulatorReports: aeRegulatorReports,
  academicCalendar: aeAcademicCalendar,
  feeGovernance: aeFeeGovernance,
  documents: aeDocuments,
  localisation: aeLocalisation,
  localization: aeLocalization,
};
