/**
 * Module-level feature flags for the K-12 first-term launch.
 *
 * These keys are checked against tenant.enabled_modules via useTenant().
 * New tenants are seeded with ['core','enrolment','fees','collections','basic_hr','accounting','attendance'].
 *
 * Any page whose module key is not in the tenant's enabled_modules array is
 * hidden from the sidebar and route-guarded to Dashboard. This turns the
 * large set of unbuilt Bucket C tables into absent menu items instead of 404s.
 */

export const DEFAULT_ENABLED_MODULES = [
  'core',
  'enrolment',
  'fees',
  'collections',
  'basic_hr',
  'accounting',
  'attendance',
];

// Legacy module keys from planDefinitions.js / existing tenant.enabled_modules
// map to the canonical module feature keys used above.
export const LEGACY_TO_CANONICAL_MODULE_KEYS = {
  hr: 'basic_hr',
  employees: 'basic_hr',
  payroll: 'payroll',
  admissions: 'enrolment',
  students: 'enrolment',
  student_attendance: 'attendance',
  finance: 'accounting',
  procurement: 'procurement',
  assets: 'assets',
  crm: 'crm',
  fleet: 'transport',
  facilities: 'facilities',
  communications: 'core',
  reports: 'core',
  integrations: 'integrations',
};

// Normalize a tenant's enabled_modules into canonical feature keys.
export function normalizeEnabledModules(enabledModules) {
  if (!Array.isArray(enabledModules) || enabledModules.length === 0) return DEFAULT_ENABLED_MODULES;
  const canonical = new Set();
  for (const key of enabledModules) {
    canonical.add(LEGACY_TO_CANONICAL_MODULE_KEYS[key] || key);
  }
  return Array.from(canonical);
}

// Page name (matching the ./pages/*.jsx file name) -> module key.
// Pages not listed here are treated as core and are always visible.
export const PAGE_MODULE_KEYS = {
  // Core attendance
  Attendance: 'attendance',
  StudentAttendancePage: 'attendance',

  // Attendance add-ons
  AttendanceDevices: 'attendance_devices',
  EmployeeAttendance: 'basic_hr',

  // Core HR
  Employees: 'basic_hr',
  EmployeeAttendance: 'basic_hr',
  HRManagerDashboard: 'basic_hr',
  EOSBCalculator: 'basic_hr',
  Leaves: 'basic_hr',
  Overtime: 'basic_hr',
  HRApprovalsInbox: 'basic_hr',
  HolidayCalendar: 'basic_hr',
  LeaveBalances: 'basic_hr',

  // HR extras
  Payroll: 'payroll',
  MyPayslips: 'payroll',
  PayslipsManagementPage: 'payroll',
  PayrollReports: 'payroll',
  BankExports: 'payroll',
  PayslipSettings: 'payroll',
  PayRunDetails: 'payroll',
  PayRunsList: 'payroll',
  RecruitmentPage: 'recruitment',
  WorkforcePlanning: 'recruitment',
  TrainingDevelopment: 'training_performance',
  PerformanceEvaluation: 'training_performance',
  DisciplinaryCases: 'training_performance',
  Onboarding: 'onboarding',
  PolicyEditor: 'onboarding',
  HRPoliciesLibrary: 'onboarding',
  Engagement: 'engagement',
  CorporateCards: 'travel_expenses',
  BusinessTravel: 'travel_expenses',
  Expenses: 'travel_expenses',

  // Assets / facilities
  Assets: 'assets',
  AssetAssignments: 'assets',
  AssetRentals: 'assets',
  Depreciation: 'assets',
  Facilities: 'facilities',

  // School operations
  CanteenManagement: 'canteen',
  LibraryManagement: 'library',
  FleetManagement: 'transport',
  TransportManagement: 'transport',
  SchoolClinic: 'clinic',
  ITHelpdesk: 'it_helpdesk',
  OperationsDashboard: 'operations',

  // CRM / communications
  CRM: 'crm',
  AdminMessaging: 'communications',
  StaffInbox: 'communications',
  NotificationPreferences: 'communications',
  NotificationSettings: 'communications',

  // ESS
  ESSPortal: 'ess',
  ESSSettings: 'ess',

  // Government / integrations
  Integrations: 'integrations',
  GovernmentRelations: 'gov_relations',
  GovIntegrations: 'gov_relations',
  ViolationsPenalties: 'gov_relations',
  IntegrationHub: 'integrations',

  // Admissions extras
  ParentIntake: 'parent_intake',
  ParentIntakeManagement: 'parent_intake',

  // AI assistant
  YamenAI: 'yamen_ai',
  YamenCollections: 'yamen_ai',

  // Procurement
  Vendors: 'procurement',
  PurchaseRequisitions: 'procurement',
  PurchaseOrders: 'procurement',

  // Core accounting (gated by accounting so the module can be turned off)
  FinanceDashboard: 'accounting',
  ChartOfAccounts: 'accounting',
  JournalEntries: 'accounting',
  GeneralLedger: 'accounting',
  TrialBalance: 'accounting',
  FinancialStatements: 'accounting',
  MonthEndClose: 'accounting',
  FiscalPeriods: 'accounting',
  CostCenters: 'accounting',

  // Collections extras
  ChequeManagement: 'collections',

  // Finance extras
  APBills: 'reconciliation',
  Reconciliation: 'reconciliation',
  Refunds: 'reconciliation',
  BankFileTemplates: 'reconciliation',
  BankManagement: 'reconciliation',
  VATManagement: 'reconciliation',

  // HR documents
  HRContracts: 'hr_documents',

  // Website / content / admin
  CMS: 'cms',
  WorkflowEngine: 'workflow',
  FixedIssuesLog: 'fixed_issues',
  TicketDetails: 'it_helpdesk',
};

// Sidebar navigation item name -> module key. Used for top-level/nested menus
// where the page name does not match the route key.
export const NAV_MODULE_KEYS = {
  ...PAGE_MODULE_KEYS,
  // Nested / aliased navigation entries
  payslips: 'payroll',
  payroll: 'payroll',
  employee_attendance: 'basic_hr',
  leaves: 'basic_hr',
  overtime: 'basic_hr',
  hrApprovalsInbox: 'basic_hr',
  holidayCalendar: 'basic_hr',
  leaveBalances: 'basic_hr',
  hrDocuments: 'hr_documents',
  operations: 'operations',
  ess: 'ess',
  essSettings: 'ess',
  parentIntake: 'parent_intake',
  parentIntakeLinks: 'parent_intake',
  yamenAI: 'yamen_ai',
  ticketDetails: 'it_helpdesk',
  recruitment: 'recruitment',
  trainingDevelopment: 'training_performance',
  performanceEvaluation: 'training_performance',
  disciplinaryCases: 'training_performance',
  onboarding: 'onboarding',
  hrPoliciesLibrary: 'onboarding',
  policyEditor: 'onboarding',
  engagement: 'engagement',
  corporateCards: 'travel_expenses',
  businessTravel: 'travel_expenses',
  expenses: 'travel_expenses',
  assetAssignments: 'assets',
  assetRentals: 'assets',
  depreciation: 'assets',
  facilities: 'facilities',
  canteenManagement: 'canteen',
  libraryManagement: 'library',
  transportManagement: 'transport',
  schoolClinic: 'clinic',
  itHelpdesk: 'it_helpdesk',
  crm: 'crm',
  adminMessaging: 'communications',
  staffInbox: 'communications',
  notificationPreferences: 'communications',
  notificationSettings: 'communications',
  governmentRelations: 'gov_relations',
  govIntegrations: 'integrations',
  apBills: 'reconciliation',
  purchaseOrders: 'reconciliation',
  reconciliation: 'reconciliation',
  refunds: 'reconciliation',
  bankFileTemplates: 'reconciliation',
  bankManagement: 'reconciliation',
  vatManagement: 'reconciliation',
  cms: 'cms',
  workflowEngine: 'workflow',
  fixedIssuesLog: 'fixed_issues',
};

export function moduleFeatureKeysForPage(pageName) {
  return PAGE_MODULE_KEYS[pageName] ? [PAGE_MODULE_KEYS[pageName]] : null;
}

export function moduleFeatureKeyForNavItem(itemName) {
  return NAV_MODULE_KEYS[itemName] || null;
}
