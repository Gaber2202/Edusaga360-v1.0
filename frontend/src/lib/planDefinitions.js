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

/**
 * Trial clients receive the FULL enterprise package during their trial period.
 * When their trial expires they must upgrade to a paid plan to retain access.
 */
export const PLAN_DEFINITIONS = {
  free_trial: {
    nameAr: 'تجربة مجانية — باقة المؤسسات',
    nameEn: 'Free Trial — Enterprise Package',
    durationDays: 30,
    maxUsers: 999,
    maxEmployees: 9999,
    maxStudents: 99999,
    maxBranches: 99,
    maxSelectableModules: 99,
    aiEnabled: true,
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
    nameEn: 'Starter Plan',
    maxUsers: 25,
    maxEmployees: 100,
    maxStudents: 1000,
    maxBranches: 2,
    maxSelectableModules: 5,
    aiEnabled: false,
    multiBranch: false,
    advancedReporting: false,
    integrationsEnabled: false,
    includedModules: ['hr', 'payroll', 'employees', 'students', 'fees'],
    priceMonthly: 1499,
    priceYearly: 14990,
    tier: 1,
  },
  professional: {
    nameAr: 'الخطة الاحترافية',
    nameEn: 'Professional Plan',
    maxUsers: 100,
    maxEmployees: 500,
    maxStudents: 5000,
    maxBranches: 5,
    maxSelectableModules: 10,
    aiEnabled: true,
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: false,
    includedModules: ['hr', 'payroll', 'employees', 'students', 'fees', 'admissions', 'student_attendance', 'reports', 'crm'],
    priceMonthly: 3999,
    priceYearly: 39990,
    tier: 2,
  },
  enterprise: {
    nameAr: 'خطة المؤسسات',
    nameEn: 'Enterprise Plan',
    maxUsers: 999,
    maxEmployees: 9999,
    maxStudents: 99999,
    maxBranches: 99,
    maxSelectableModules: 99,
    aiEnabled: true,
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: true,
    includedModules: ALL_MODULE_KEYS,
    priceMonthly: 7999,
    priceYearly: 79990,
    tier: 3,
  },
  government: {
    nameAr: 'الخطة الحكومية',
    nameEn: 'Government Plan',
    maxUsers: 9999,
    maxEmployees: 99999,
    maxStudents: 999999,
    maxBranches: 999,
    maxSelectableModules: 999,
    aiEnabled: true,
    multiBranch: true,
    advancedReporting: true,
    integrationsEnabled: true,
    includedModules: ALL_MODULE_KEYS,
    priceMonthly: 0,
    priceYearly: 0,
    tier: 4,
  },
};
