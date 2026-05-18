import { useCallback, useMemo } from 'react';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { PLAN_DEFINITIONS, ALL_MODULE_KEYS } from '../lib/planDefinitions';

/**
 * All available modules in the platform with metadata.
 */
export const ALL_MODULES = [
  { key: 'hr', nameAr: 'الموارد البشرية', nameEn: 'Human Resources', icon: 'Users', core: true },
  { key: 'payroll', nameAr: 'الرواتب', nameEn: 'Payroll', icon: 'DollarSign', core: true },
  { key: 'employees', nameAr: 'الموظفون', nameEn: 'Employees', icon: 'Users', core: true },
  { key: 'admissions', nameAr: 'القبول والتسجيل', nameEn: 'Admissions', icon: 'GraduationCap', core: false },
  { key: 'students', nameAr: 'الطلاب', nameEn: 'Students', icon: 'Users', core: false },
  { key: 'student_attendance', nameAr: 'حضور الطلاب', nameEn: 'Student Attendance', icon: 'ClipboardCheck', core: false },
  { key: 'fees', nameAr: 'الرسوم والفواتير', nameEn: 'Fees & Billing', icon: 'CreditCard', core: false },
  { key: 'finance', nameAr: 'المالية', nameEn: 'Finance', icon: 'Wallet', core: false },
  { key: 'procurement', nameAr: 'المشتريات', nameEn: 'Procurement', icon: 'ShoppingCart', core: false },
  { key: 'assets', nameAr: 'الأصول الثابتة', nameEn: 'Fixed Assets', icon: 'Package', core: false },
  { key: 'crm', nameAr: 'خدمة العملاء', nameEn: 'CRM', icon: 'Headphones', core: false },
  { key: 'fleet', nameAr: 'إدارة الأسطول', nameEn: 'Fleet Management', icon: 'Truck', core: false },
  { key: 'facilities', nameAr: 'المرافق', nameEn: 'Facilities', icon: 'Wrench', core: false },
  { key: 'communications', nameAr: 'الاتصالات', nameEn: 'Communications', icon: 'MessageSquare', core: false },
  { key: 'reports', nameAr: 'التقارير', nameEn: 'Reports', icon: 'FileBarChart', core: false },
  { key: 'integrations', nameAr: 'التكاملات', nameEn: 'Integrations', icon: 'Link2', core: false },
];

// Re-export so existing callers importing from this file keep working.
export { PLAN_DEFINITIONS, ALL_MODULE_KEYS };

/**
 * Hook to check module access for current tenant.
 */
export function useModuleAccess() {
  const { tenant, isModuleEnabled } = useTenant();
  const { isCreator } = useRole();

  const canAccessModule = useCallback((moduleKey) => {
    if (isCreator()) return true;
    return isModuleEnabled(moduleKey);
  }, [isCreator, isModuleEnabled]);

  const getActivePlan = useCallback(() => {
    if (!tenant) return PLAN_DEFINITIONS.enterprise; // platform owner gets all
    return PLAN_DEFINITIONS[tenant.plan_code] || PLAN_DEFINITIONS.free_trial;
  }, [tenant]);

  const isTrialExpired = useCallback(() => {
    if (!tenant || tenant.status !== 'trial') return false;
    if (!tenant.trial_end_date) return false;
    return new Date(tenant.trial_end_date) < new Date();
  }, [tenant]);

  return useMemo(
    () => ({ canAccessModule, getActivePlan, isTrialExpired, ALL_MODULES, PLAN_DEFINITIONS }),
    [canAccessModule, getActivePlan, isTrialExpired]
  );
}

export default useModuleAccess;
