/**
 * Canonical tenant app-role catalogue.
 *
 * Names, module access, and action permissions for every provisioned role.
 * The `roles` table is seeded from this list (system rows, tenant_id NULL).
 * Keep role_code values in sync with frontend/src/lib/authHelpers.js VALID_APP_ROLES.
 */

export const ROLE_MODULE_KEYS = [
  'dashboard',
  'admissions',
  'students',
  'student_attendance',
  'fees',
  'finance',
  'procurement',
  'assets',
  'hr',
  'employees',
  'employee_attendance',
  'leaves',
  'overtime',
  'payroll',
  'crm',
  'fleet',
  'facilities',
  'communications',
  'reports',
  'audit_logs',
  'integrations',
  'settings',
  'clinic',
] as const;

export const ROLE_ACTION_KEYS = [
  'create',
  'edit',
  'delete',
  'approve',
  'export',
  'send',
  'post',
  'reverse',
  'view_salary_amounts',
  'view_finance_amounts',
] as const;

export type RoleModuleKey = (typeof ROLE_MODULE_KEYS)[number];
export type RoleActionKey = (typeof ROLE_ACTION_KEYS)[number];
export type DataScope = 'all' | 'company' | 'branch' | 'department' | 'own';

export interface AppRoleDefinition {
  role_code: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  data_scope: DataScope;
  is_creator_role: boolean;
  is_assignable: boolean;
  modules: ReadonlyArray<RoleModuleKey | '*'>;
  actions: ReadonlyArray<RoleActionKey | '*'>;
}

function flagMap<T extends string>(
  all: readonly T[],
  enabled: readonly (T | '*')[],
): Record<string, boolean> {
  if (enabled.includes('*')) {
    return Object.fromEntries(all.map((k) => [k, true]));
  }
  const set = new Set(enabled);
  return Object.fromEntries(all.map((k) => [k, set.has(k)]));
}

export function moduleAccessFromDef(def: AppRoleDefinition): Record<string, boolean> {
  return flagMap(ROLE_MODULE_KEYS, def.modules);
}

export function actionPermissionsFromDef(def: AppRoleDefinition): Record<string, boolean> {
  return flagMap(ROLE_ACTION_KEYS, def.actions);
}

const ALL_OPS: ReadonlyArray<RoleActionKey | '*'> = ['*'];
const READ_EXPORT: ReadonlyArray<RoleActionKey | '*'> = ['export'];
const HR_OPS: ReadonlyArray<RoleActionKey | '*'> = ['create', 'edit', 'delete', 'approve', 'export', 'send', 'view_salary_amounts'];
const FINANCE_OPS: ReadonlyArray<RoleActionKey | '*'> = ['create', 'edit', 'export', 'post', 'reverse', 'view_finance_amounts', 'view_salary_amounts'];

export const APP_ROLE_CATALOG: AppRoleDefinition[] = [
  {
    role_code: 'admin',
    name_en: 'Admin',
    name_ar: 'مدير النظام',
    description_en: 'Full school administration',
    description_ar: 'إدارة المدرسة بالكامل',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['*'],
    actions: ALL_OPS,
  },
  {
    role_code: 'creator',
    name_en: 'Creator',
    name_ar: 'المنشئ',
    description_en: 'Platform owner — full access',
    description_ar: 'مالك المنصة — صلاحيات كاملة',
    data_scope: 'all',
    is_creator_role: true,
    is_assignable: false,
    modules: ['*'],
    actions: ALL_OPS,
  },
  {
    role_code: 'ceo',
    name_en: 'CEO',
    name_ar: 'الرئيس التنفيذي',
    description_en: 'Executive oversight and reports',
    description_ar: 'إشراف تنفيذي وتقارير',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'reports', 'audit_logs'],
    actions: ['approve', 'export'],
  },
  {
    role_code: 'cfo',
    name_en: 'CFO',
    name_ar: 'المدير المالي',
    description_en: 'Finance, fees, payroll amounts, and posting',
    description_ar: 'المالية والرسوم ومبالغ الرواتب والترحيل',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'fees', 'finance', 'procurement', 'assets', 'payroll', 'reports'],
    actions: FINANCE_OPS,
  },
  {
    role_code: 'coo',
    name_en: 'COO',
    name_ar: 'مدير العمليات',
    description_en: 'Operations oversight',
    description_ar: 'إشراف على العمليات',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'reports', 'facilities', 'fleet', 'crm', 'communications'],
    actions: READ_EXPORT,
  },
  {
    role_code: 'chro',
    name_en: 'CHRO',
    name_ar: 'رئيس الموارد البشرية',
    description_en: 'Workforce strategy and salary visibility',
    description_ar: 'استراتيجية القوى العاملة وعرض الرواتب',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'hr', 'employees', 'employee_attendance', 'leaves', 'overtime', 'payroll', 'reports'],
    actions: ['approve', 'export', 'view_salary_amounts'],
  },
  {
    role_code: 'hr_head',
    name_en: 'HR Head',
    name_ar: 'رئيس الموارد البشرية التشغيلي',
    description_en: 'HR operations including payroll and EOSB',
    description_ar: 'عمليات الموارد البشرية بما فيها الرواتب',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'hr', 'employees', 'employee_attendance', 'leaves', 'overtime', 'payroll', 'reports', 'settings'],
    actions: HR_OPS,
  },
  {
    role_code: 'hr_admin',
    name_en: 'HR Admin',
    name_ar: 'مدير الموارد البشرية',
    description_en: 'Employees, attendance, leaves, and payroll',
    description_ar: 'الموظفون والحضور والإجازات والرواتب',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'hr', 'employees', 'employee_attendance', 'leaves', 'overtime', 'payroll', 'reports'],
    actions: HR_OPS,
  },
  {
    role_code: 'hr_officer',
    name_en: 'HR Officer',
    name_ar: 'موظف موارد بشرية',
    description_en: 'Employees, attendance, and leaves',
    description_ar: 'الموظفون والحضور والإجازات',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'hr', 'employees', 'employee_attendance', 'leaves', 'overtime'],
    actions: ['create', 'edit', 'export'],
  },
  {
    role_code: 'finance',
    name_en: 'Finance Officer',
    name_ar: 'مالية',
    description_en: 'Fees, finance, procurement, and payroll approval',
    description_ar: 'الرسوم والمالية والمشتريات واعتماد الرواتب',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'fees', 'finance', 'procurement', 'assets', 'payroll', 'reports'],
    actions: FINANCE_OPS,
  },
  {
    role_code: 'accountant',
    name_en: 'Accountant',
    name_ar: 'محاسب',
    description_en: 'Fees, invoices, and finance entries',
    description_ar: 'الرسوم والفواتير والقيود المالية',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'students', 'fees', 'finance', 'reports'],
    actions: ['create', 'edit', 'export', 'view_finance_amounts'],
  },
  {
    role_code: 'branch_manager',
    name_en: 'Branch Manager',
    name_ar: 'مدير الفرع',
    description_en: 'Single-branch oversight',
    description_ar: 'إشراف على فرع واحد',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: [
      'dashboard', 'admissions', 'students', 'student_attendance',
      'employees', 'employee_attendance', 'leaves', 'fees', 'reports', 'settings',
    ],
    actions: ['approve', 'export'],
  },
  {
    role_code: 'admissions',
    name_en: 'Admissions Officer',
    name_ar: 'قبول وتسجيل',
    description_en: 'Enrolment and student records',
    description_ar: 'القبول وسجلات الطلاب',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'admissions', 'students', 'student_attendance', 'fees'],
    actions: ['create', 'edit', 'export'],
  },
  {
    role_code: 'teacher',
    name_en: 'Teacher',
    name_ar: 'معلم',
    description_en: 'Student attendance and student records',
    description_ar: 'حضور الطلاب وعرض بياناتهم',
    data_scope: 'own',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'students', 'student_attendance'],
    actions: ['edit'],
  },
  {
    role_code: 'parent',
    name_en: 'Parent',
    name_ar: 'ولي أمر',
    description_en: 'Linked children only',
    description_ar: 'الأبناء المرتبطون فقط',
    data_scope: 'own',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'students', 'student_attendance', 'fees'],
    actions: [],
  },
  {
    role_code: 'procurement',
    name_en: 'Procurement',
    name_ar: 'مشتريات',
    description_en: 'Vendors, requisitions, and purchase orders',
    description_ar: 'الموردون وطلبات الشراء وأوامر الشراء',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'procurement', 'assets', 'reports'],
    actions: ['create', 'edit', 'approve', 'export'],
  },
  {
    role_code: 'collections',
    name_en: 'Collections',
    name_ar: 'التحصيل',
    description_en: 'Fee collections and parent follow-up',
    description_ar: 'تحصيل الرسوم ومتابعة أولياء الأمور',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'fees', 'crm', 'communications', 'reports'],
    actions: ['create', 'edit', 'send', 'export', 'view_finance_amounts'],
  },
  {
    role_code: 'auditor',
    name_en: 'Auditor',
    name_ar: 'مراجع داخلي',
    description_en: 'Read-only finance and audit logs',
    description_ar: 'قراءة المالية وسجل المراجعة',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'fees', 'finance', 'payroll', 'reports', 'audit_logs'],
    actions: ['export', 'view_finance_amounts', 'view_salary_amounts'],
  },
  {
    role_code: 'crm_agent',
    name_en: 'CRM Agent',
    name_ar: 'وكيل خدمة العملاء',
    description_en: 'Parent communications and CRM',
    description_ar: 'التواصل مع أولياء الأمور وخدمة العملاء',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'crm', 'communications', 'admissions'],
    actions: ['create', 'edit', 'send'],
  },
  {
    role_code: 'it_admin',
    name_en: 'IT Admin',
    name_ar: 'مدير تقنية المعلومات',
    description_en: 'Integrations, settings, and audit logs',
    description_ar: 'التكاملات والإعدادات وسجل المراجعة',
    data_scope: 'all',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'settings', 'integrations', 'audit_logs'],
    actions: ['create', 'edit', 'delete', 'export'],
  },
  {
    role_code: 'it_support',
    name_en: 'IT Support',
    name_ar: 'دعم تقنية المعلومات',
    description_en: 'Help desk and device support',
    description_ar: 'مكتب المساعدة ودعم الأجهزة',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'settings'],
    actions: ['edit'],
  },
  {
    role_code: 'it_user',
    name_en: 'IT User',
    name_ar: 'مستخدم تقنية المعلومات',
    description_en: 'Settings and user administration',
    description_ar: 'الإعدادات وإدارة المستخدمين',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'settings', 'integrations', 'audit_logs'],
    actions: ['edit', 'export'],
  },
  {
    role_code: 'facilities_manager',
    name_en: 'Facilities Manager',
    name_ar: 'مدير المرافق',
    description_en: 'Facilities and fleet',
    description_ar: 'المرافق والأسطول',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'facilities', 'fleet', 'assets'],
    actions: ['create', 'edit', 'approve'],
  },
  {
    role_code: 'content_manager',
    name_en: 'Content Manager',
    name_ar: 'مدير المحتوى',
    description_en: 'Communications and content',
    description_ar: 'الاتصالات والمحتوى',
    data_scope: 'company',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'communications'],
    actions: ['create', 'edit', 'send'],
  },
  {
    role_code: 'nurse',
    name_en: 'School Nurse',
    name_ar: 'ممرض/ة المدرسة',
    description_en: 'School clinic visits and student health records',
    description_ar: 'زيارات العيادة المدرسية والسجلات الصحية',
    data_scope: 'branch',
    is_creator_role: false,
    is_assignable: true,
    modules: ['dashboard', 'students', 'student_attendance', 'clinic', 'communications'],
    actions: ['create', 'edit', 'send', 'export'],
  },
  {
    role_code: 'unassigned',
    name_en: 'Pending Assignment',
    name_ar: 'بانتظار التعيين',
    description_en: 'Least-privileged placeholder until an admin assigns a role',
    description_ar: 'صلاحيات دنيا حتى يعيّن المسؤول دوراً',
    data_scope: 'own',
    is_creator_role: false,
    is_assignable: false,
    modules: ['dashboard'],
    actions: [],
  },
];

export const SYSTEM_ROLE_CODES = new Set(APP_ROLE_CATALOG.map((r) => r.role_code));

export function catalogByCode(code: string): AppRoleDefinition | undefined {
  return APP_ROLE_CATALOG.find((r) => r.role_code === code);
}

export function isAssignableRoleCode(code: string): boolean {
  return catalogByCode(code)?.is_assignable === true;
}

export function toSystemRoleRow(def: AppRoleDefinition) {
  return {
    role_code: def.role_code,
    name: def.name_en,
    name_en: def.name_en,
    name_ar: def.name_ar,
    description: def.description_en,
    description_en: def.description_en,
    description_ar: def.description_ar,
    module_access: moduleAccessFromDef(def),
    action_permissions: actionPermissionsFromDef(def),
    data_scope: def.data_scope,
    is_system: true,
    is_system_role: true,
    is_creator_role: def.is_creator_role,
    is_assignable: def.is_assignable,
    is_active: true,
    is_trial: false,
    tenant_id: null,
  };
}
