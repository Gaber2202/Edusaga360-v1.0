/**
 * Canonical role permission shape.
 *
 * `RoleContext.hasPermission()` reads `role.action_permissions[action]`.
 * `RoleContext.canAccess(module)` reads `role.module_access[module]`.
 *
 * Any other shape a UI writes is effectively dead data — it will never grant
 * access at runtime. Keep this file as the single source of truth for shape +
 * defaults + presets so all role-editing UIs stay consistent.
 */

export const ROLE_MODULES = [
  { key: 'dashboard', nameAr: 'لوحة التحكم', nameEn: 'Dashboard', group: 'core' },
  { key: 'admissions', nameAr: 'القبول والتسجيل', nameEn: 'Admissions', group: 'academic' },
  { key: 'students', nameAr: 'الطلاب', nameEn: 'Students', group: 'academic' },
  { key: 'student_attendance', nameAr: 'حضور الطلاب', nameEn: 'Student Attendance', group: 'academic' },
  { key: 'fees', nameAr: 'الرسوم والفواتير', nameEn: 'Fees & Billing', group: 'finance' },
  { key: 'finance', nameAr: 'المالية', nameEn: 'Finance', group: 'finance' },
  { key: 'procurement', nameAr: 'المشتريات', nameEn: 'Procurement', group: 'finance' },
  { key: 'assets', nameAr: 'الأصول الثابتة', nameEn: 'Fixed Assets', group: 'finance' },
  { key: 'hr', nameAr: 'الموارد البشرية', nameEn: 'Human Resources', group: 'hr' },
  { key: 'employees', nameAr: 'الموظفون', nameEn: 'Employees', group: 'hr' },
  { key: 'employee_attendance', nameAr: 'حضور الموظفين', nameEn: 'Employee Attendance', group: 'hr' },
  { key: 'leaves', nameAr: 'الإجازات', nameEn: 'Leaves', group: 'hr' },
  { key: 'overtime', nameAr: 'العمل الإضافي', nameEn: 'Overtime', group: 'hr' },
  { key: 'payroll', nameAr: 'الرواتب', nameEn: 'Payroll', group: 'hr' },
  { key: 'crm', nameAr: 'خدمة العملاء', nameEn: 'CRM', group: 'ops' },
  { key: 'fleet', nameAr: 'إدارة الأسطول', nameEn: 'Fleet', group: 'ops' },
  { key: 'facilities', nameAr: 'المرافق', nameEn: 'Facilities', group: 'ops' },
  { key: 'communications', nameAr: 'الاتصالات', nameEn: 'Communications', group: 'ops' },
  { key: 'reports', nameAr: 'التقارير', nameEn: 'Reports', group: 'admin' },
  { key: 'audit_logs', nameAr: 'سجل المراجعة', nameEn: 'Audit Logs', group: 'admin' },
  { key: 'integrations', nameAr: 'التكاملات', nameEn: 'Integrations', group: 'admin' },
  { key: 'settings', nameAr: 'الإعدادات', nameEn: 'Settings', group: 'admin' },
];

export const ROLE_MODULE_GROUPS = [
  { key: 'core', nameAr: 'أساسي', nameEn: 'Core' },
  { key: 'academic', nameAr: 'أكاديمي', nameEn: 'Academic' },
  { key: 'finance', nameAr: 'المالية', nameEn: 'Finance' },
  { key: 'hr', nameAr: 'الموارد البشرية', nameEn: 'HR' },
  { key: 'ops', nameAr: 'العمليات', nameEn: 'Operations' },
  { key: 'admin', nameAr: 'الإدارة', nameEn: 'Admin' },
];

/**
 * Action permissions — flat, not per-module. These match the keys that
 * `RoleContext.hasPermission(action)` checks and that downstream pages call
 * via `hasPermission('post')`, `hasPermission('view_salary_amounts')`, etc.
 */
export const ROLE_ACTIONS = [
  { key: 'create', nameAr: 'إنشاء', nameEn: 'Create' },
  { key: 'edit', nameAr: 'تعديل', nameEn: 'Edit' },
  { key: 'delete', nameAr: 'حذف', nameEn: 'Delete' },
  { key: 'approve', nameAr: 'اعتماد', nameEn: 'Approve' },
  { key: 'export', nameAr: 'تصدير', nameEn: 'Export' },
  { key: 'send', nameAr: 'إرسال', nameEn: 'Send' },
  { key: 'post', nameAr: 'ترحيل', nameEn: 'Post' },
  { key: 'reverse', nameAr: 'عكس', nameEn: 'Reverse' },
  { key: 'view_salary_amounts', nameAr: 'عرض الرواتب', nameEn: 'View Salary Amounts' },
  { key: 'view_finance_amounts', nameAr: 'عرض المبالغ المالية', nameEn: 'View Finance Amounts' },
];

export const EMPTY_MODULE_ACCESS = Object.freeze(
  Object.fromEntries(ROLE_MODULES.map((m) => [m.key, false])),
);

export const EMPTY_ACTION_PERMISSIONS = Object.freeze(
  Object.fromEntries(ROLE_ACTIONS.map((a) => [a.key, false])),
);

/**
 * Preset templates — baseline permission sets for common tenant personas.
 * Applied as a starting point in the builder; user then tweaks.
 */
export const ROLE_PRESETS = [
  {
    key: 'hr_officer',
    nameAr: 'موظف موارد بشرية',
    nameEn: 'HR Officer',
    descriptionAr: 'إدارة الموظفين والحضور والإجازات',
    descriptionEn: 'Manage employees, attendance, and leaves',
    modules: ['dashboard', 'hr', 'employees', 'employee_attendance', 'leaves', 'overtime'],
    actions: ['create', 'edit', 'export'],
  },
  {
    key: 'finance_clerk',
    nameAr: 'محاسب',
    nameEn: 'Finance Clerk',
    descriptionAr: 'إدخال الرسوم والفواتير والمعاملات المالية',
    descriptionEn: 'Fees, invoices, and finance entries',
    modules: ['dashboard', 'fees', 'finance', 'procurement', 'assets', 'reports'],
    actions: ['create', 'edit', 'export', 'view_finance_amounts'],
  },
  {
    key: 'teacher',
    nameAr: 'معلم',
    nameEn: 'Teacher',
    descriptionAr: 'حضور الطلاب وعرض بيانات الطلاب',
    descriptionEn: 'Student attendance and view students',
    modules: ['dashboard', 'students', 'student_attendance'],
    actions: ['edit'],
  },
  {
    key: 'branch_manager',
    nameAr: 'مدير فرع',
    nameEn: 'Branch Manager',
    descriptionAr: 'إدارة فرع واحد — قراءة واسعة، اعتماد محدود',
    descriptionEn: 'Single-branch oversight — broad read, limited approve',
    modules: [
      'dashboard',
      'admissions',
      'students',
      'student_attendance',
      'employees',
      'employee_attendance',
      'fees',
      'reports',
    ],
    actions: ['approve', 'export'],
  },
];

export function makeEmptyForm() {
  return {
    role_code: '',
    name_ar: '',
    name_en: '',
    description_ar: '',
    description_en: '',
    module_access: { ...EMPTY_MODULE_ACCESS },
    action_permissions: { ...EMPTY_ACTION_PERMISSIONS },
    data_scope: 'branch',
    is_trial: false,
  };
}

/**
 * Normalize whatever shape an existing Role record has into the canonical form
 * the builder expects. Tolerates missing keys and legacy per-module shape.
 */
export function formFromRole(role) {
  const base = makeEmptyForm();
  if (!role) return base;

  const module_access = { ...EMPTY_MODULE_ACCESS };
  if (role.module_access && typeof role.module_access === 'object') {
    for (const k of Object.keys(role.module_access)) {
      if (Object.prototype.hasOwnProperty.call(EMPTY_MODULE_ACCESS, k)) {
        module_access[k] = Boolean(role.module_access[k]);
      }
    }
  }

  const action_permissions = { ...EMPTY_ACTION_PERMISSIONS };
  if (role.action_permissions && typeof role.action_permissions === 'object') {
    for (const k of Object.keys(role.action_permissions)) {
      if (Object.prototype.hasOwnProperty.call(EMPTY_ACTION_PERMISSIONS, k)) {
        action_permissions[k] = Boolean(role.action_permissions[k]);
      }
    }
  }

  return {
    role_code: role.role_code || '',
    name_ar: role.name_ar || '',
    name_en: role.name_en || '',
    description_ar: role.description_ar || role.description || '',
    description_en: role.description_en || role.description || '',
    module_access,
    action_permissions,
    data_scope: role.data_scope || 'branch',
    is_trial: Boolean(role.is_trial),
  };
}

export function applyPreset(form, presetKey) {
  const preset = ROLE_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return form;
  const module_access = { ...EMPTY_MODULE_ACCESS };
  for (const k of preset.modules) {
    if (Object.prototype.hasOwnProperty.call(EMPTY_MODULE_ACCESS, k)) module_access[k] = true;
  }
  const action_permissions = { ...EMPTY_ACTION_PERMISSIONS };
  for (const k of preset.actions) {
    if (Object.prototype.hasOwnProperty.call(EMPTY_ACTION_PERMISSIONS, k)) action_permissions[k] = true;
  }
  return {
    ...form,
    module_access,
    action_permissions,
  };
}

export function setAllModules(form, value) {
  const module_access = { ...form.module_access };
  for (const k of Object.keys(EMPTY_MODULE_ACCESS)) module_access[k] = value;
  return { ...form, module_access };
}

export function setAllActions(form, value) {
  const action_permissions = { ...form.action_permissions };
  for (const k of Object.keys(EMPTY_ACTION_PERMISSIONS)) action_permissions[k] = value;
  return { ...form, action_permissions };
}

export function setGroupModules(form, groupKey, value) {
  const module_access = { ...form.module_access };
  for (const m of ROLE_MODULES) {
    if (m.group === groupKey) module_access[m.key] = value;
  }
  return { ...form, module_access };
}

const hasOwn = Object.prototype.hasOwnProperty;

export function toggleModule(form, moduleKey) {
  if (!hasOwn.call(EMPTY_MODULE_ACCESS, moduleKey)) return form;
  return {
    ...form,
    module_access: { ...form.module_access, [moduleKey]: !form.module_access[moduleKey] },
  };
}

export function toggleAction(form, actionKey) {
  if (!hasOwn.call(EMPTY_ACTION_PERMISSIONS, actionKey)) return form;
  return {
    ...form,
    action_permissions: {
      ...form.action_permissions,
      [actionKey]: !form.action_permissions[actionKey],
    },
  };
}

export function isRoleEditable(role) {
  if (!role) return true;
  return !(role.is_system_role || role.is_creator_role);
}

export function summarizeForm(form) {
  const enabledModules = Object.entries(form.module_access)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const enabledActions = Object.entries(form.action_permissions)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return { enabledModules, enabledActions };
}
