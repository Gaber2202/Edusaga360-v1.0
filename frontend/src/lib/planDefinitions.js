/**
 * SINGLE SOURCE OF TRUTH for plan definitions.
 *
 * These numbers drive both:
 *   - What the UI renders in subscription / onboarding pages (client)
 *   - What `base44/functions/approveTenantRequest` writes onto a new Tenant record (server)
 *
 * Edge functions (Deno) cannot import from `src/`, so they mirror these values in
 * `base44/functions/approveTenantRequest/entry.ts` under a clearly-labeled comment.
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

export const PLAN_DEFINITIONS = {
  free_trial: {
    nameAr: 'تجربة مجانية',
    nameEn: 'Free Trial',
    durationDays: 30,
    maxUsers: 10,
    maxEmployees: 50,
    maxStudents: 500,
    maxBranches: 2,
    maxSelectableModules: 5,
    aiEnabled: false,
    multiBranch: true,
    advancedReporting: false,
    integrationsEnabled: false,
    includedModules: ['hr', 'payroll', 'employees', 'students', 'fees'],
    priceMonthly: 0,
    priceYearly: 0,
  },
  startup: {
    nameAr: 'خطة الانطلاق',
    nameEn: 'Startup Plan',
    maxUsers: 25,
    maxEmployees: 100,
    maxStudents: 1000,
    maxBranches: 2,
    maxSelectableModules: 5,
    aiEnabled: true,
    multiBranch: false,
    advancedReporting: false,
    integrationsEnabled: false,
    includedModules: ['hr', 'payroll', 'employees', 'reports'],
    priceMonthly: 2999,
    priceYearly: 29990,
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
  },
};
