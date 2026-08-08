/**
 * SINGLE SOURCE OF TRUTH for plan definitions.
 *
 * These numbers drive both:
 *   - What the UI renders in subscription / onboarding pages (client)
 *   - What `the backend/functions/approveTenantRequest` writes onto a new Tenant record (server)
 *
 * Edge functions (Deno) cannot import from `src/`, so they mirror these values in
 * `the backend/functions/approveTenantRequest/entry.ts` under a clearly-labeled comment.
 * If you change a limit here, update that file in the same commit.
 *
 * Pricing (annual, excl. VAT):
 *   Starter   — 120,000 /yr  (Core + Academic & Operations)
 *   Growth    — 190,000 /yr  (+ Financials ERP, HR & Payroll)
 *   Enterprise — 342,000 /yr  (All modules, 100 staff users, 6,000 general access)
 */

export const ALL_MODULE_KEYS = [
  'hr',
  'payroll',
  'employees',
  'admissions',
  'students',
  'student_attendance',
  'fees',
  'finance',
  'procurement',
  'assets',
  'crm',
  'fleet',
  'facilities',
  'communications',
  'reports',
  'integrations',
];

// Modules included in the Core + Academic & Operations bundle (Starter and above)
const CORE_MODULES = [
  'employees', 'admissions', 'students', 'student_attendance',
  'fees', 'communications', 'reports',
];

// Growth adds Financials ERP + HR & Payroll
const GROWTH_MODULES = [
  ...CORE_MODULES,
  'hr', 'payroll', 'finance', 'procurement', 'assets', 'crm',
];

/**
 * Trial clients receive the FULL enterprise package during their trial period.
 * When their trial expires they must upgrade to a paid plan to retain access.
 */
export const PLAN_DEFINITIONS = {
  free_trial: {
    nameAr: 'تجربة مجانية — باقة المؤسسات',
    nameEn: 'Free Trial — Enterprise Package',
    durationDays: 30,
    // maxUsers = general access (parents/vendors); maxEmployees = full staff users
    maxUsers: 6000,
    maxEmployees: 100,
    maxStudents: 99999,
    maxBranches: 10,
    maxSelectableModules: 99,
    aiEnabled: true,
    yamenAiMonthlyLimit: 5000,
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: true,
    includedModules: ALL_MODULE_KEYS,
    priceMonthly: 0,
    priceYearly: 0,
    tier: 0,
  },

  starter: {
    nameAr: 'خطة الانطلاق',
    nameEn: 'Starter',
    // Core Platform + Academic & Operations
    maxUsers: 500,        // general access users (parents/vendors/admin portal)
    maxEmployees: 15,     // named full-access staff
    maxStudents: 99999,
    maxBranches: 1,
    maxSelectableModules: 7,
    aiEnabled: false,
    yamenAiMonthlyLimit: 0,
    multiBranch: false,
    advancedReporting: false,
    integrationsEnabled: false,
    includedModules: CORE_MODULES,
    priceMonthly: 0,      // annual-only pricing
    priceYearly: 120000,
    support: 'addon',     // support is a paid add-on
    tier: 1,
  },

  growth: {
    nameAr: 'خطة النمو',
    nameEn: 'Growth',
    // Core + Academic + Financials ERP + HR & Payroll
    maxUsers: 2000,
    maxEmployees: 30,
    maxStudents: 99999,
    maxBranches: 3,
    maxSelectableModules: 12,
    aiEnabled: true,
    yamenAiMonthlyLimit: 500,   // limited AI tokens/month
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: false,
    includedModules: GROWTH_MODULES,
    priceMonthly: 0,
    priceYearly: 190000,
    support: 'addon',
    tier: 2,
  },

  enterprise: {
    nameAr: 'خطة المؤسسات',
    nameEn: 'Enterprise',
    // All modules — full ERP
    maxUsers: 6000,
    maxEmployees: 100,
    maxStudents: 99999,
    maxBranches: 10,
    maxSelectableModules: 99,
    aiEnabled: true,
    yamenAiMonthlyLimit: 5000,  // higher token limit
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: true,
    includedModules: ALL_MODULE_KEYS,
    priceMonthly: 0,
    priceYearly: 342000,
    support: 'dedicated',       // Dedicated + SLA
    tier: 3,
  },

  // Legacy codes kept for backward-compatibility with existing tenants in DB.
  // Not shown in new plan selection UI.
  professional: {
    nameAr: 'الخطة الاحترافية',
    nameEn: 'Professional Plan',
    maxUsers: 2000,
    maxEmployees: 30,
    maxStudents: 99999,
    maxBranches: 3,
    maxSelectableModules: 12,
    aiEnabled: true,
    yamenAiMonthlyLimit: 500,
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: false,
    includedModules: GROWTH_MODULES,
    priceMonthly: 0,
    priceYearly: 190000,
    support: 'addon',
    tier: 2,
  },
  government: {
    nameAr: 'الخطة الحكومية',
    nameEn: 'Government Plan',
    maxUsers: 99999,
    maxEmployees: 9999,
    maxStudents: 999999,
    maxBranches: 999,
    maxSelectableModules: 999,
    aiEnabled: true,
    yamenAiMonthlyLimit: 99999,
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: true,
    includedModules: ALL_MODULE_KEYS,
    priceMonthly: 0,
    priceYearly: 0,
    support: 'dedicated',
    tier: 4,
  },
};
