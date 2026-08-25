import { createPageUrl } from '../utils';

/** Maps Executive KPI card ids to navigable admin pages. */
export const EXEC_KPI_LINKS = {
  revenue: 'Fees',
  ebitda: 'JournalEntries',
  collection: 'Collections',
  margin: 'Fees',
  enrollment: 'Students',
  capacity: 'Students',
  compliance: 'GovernmentRelations',
  'cash-runway': 'Collections',
  'cfo-revenue': 'Fees',
  'cfo-ebitda': 'JournalEntries',
  'cfo-cash': 'Collections',
  'cfo-dso': 'Collections',
  'cfo-collection': 'Collections',
  'cfo-overdue': 'Fees',
  'coo-capacity': 'Students',
  'coo-ratio': 'Employees',
  'coo-attendance': 'StudentAttendancePage',
  'coo-applicants': 'Admissions',
  'chro-headcount': 'Employees',
  'chro-saudization': 'GovernmentRelations',
  'chro-open-roles': 'RecruitmentPage',
  'chro-retention': 'Employees',
  'principal-enrolled': 'Students',
  'principal-capacity': 'Students',
  'principal-ratio': 'Employees',
  'principal-attendance': 'StudentAttendancePage',
  'principal-score': 'Students',
  'principal-homework': 'Students',
  'principal-admissions': 'Admissions',
  'principal-growth': 'Students',
  'admin-students': 'Students',
  'admin-admissions': 'Admissions',
  'admin-overdue': 'Fees',
  'admin-collection': 'Collections',
  'admin-leave': 'HRApprovalsInbox',
  'admin-staff': 'Employees',
  'admin-iqama': 'GovernmentRelations',
};

export function execKpiHref(id) {
  const page = EXEC_KPI_LINKS[id];
  return page ? createPageUrl(page) : undefined;
}
