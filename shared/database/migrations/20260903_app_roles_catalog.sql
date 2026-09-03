-- Align public.roles with the app role catalogue (names, module/action
-- permissions) and allow authenticated users to read system + own-tenant roles.
-- Writes go through the backend service role.

ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS role_code TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS name_ar TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS description_en TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS description_ar TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS module_access JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS action_permissions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS data_scope TEXT DEFAULT 'branch';
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_system_role BOOLEAN DEFAULT FALSE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_creator_role BOOLEAN DEFAULT FALSE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_assignable BOOLEAN DEFAULT TRUE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS last_modified_by TEXT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS last_modified_date TIMESTAMPTZ;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill display columns from the original `name` / `description` if needed.
UPDATE public.roles
SET
  name_en = COALESCE(NULLIF(name_en, ''), name, role_code),
  name_ar = COALESCE(NULLIF(name_ar, ''), name, role_code),
  description_en = COALESCE(description_en, description),
  description_ar = COALESCE(description_ar, description),
  is_system_role = COALESCE(is_system_role, is_system, FALSE)
WHERE name_en IS NULL OR name_ar IS NULL OR is_system_role IS NULL;

UPDATE public.roles
SET role_code = 'legacy_' || replace(id::text, '-', '')
WHERE role_code IS NULL OR btrim(role_code) = '';

ALTER TABLE public.roles ALTER COLUMN role_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS roles_role_code_uidx
  ON public.roles (role_code);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_select_authenticated ON public.roles;
DO $$
BEGIN
  IF to_regprocedure('public.auth_tenant_id()') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY roles_select_authenticated
        ON public.roles FOR SELECT TO authenticated
        USING (
          tenant_id IS NULL
          OR tenant_id::text = (SELECT public.auth_tenant_id())
          OR (SELECT public.auth_is_platform_owner())
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY roles_select_authenticated
        ON public.roles FOR SELECT TO authenticated
        USING (
          tenant_id IS NULL
          OR tenant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
          OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean, false)
        )
    $p$;
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.roles FROM anon, authenticated;
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;

-- System catalogue. Permissions JSON is also upserted by GET /api/roles.
INSERT INTO public.roles (
  role_code, name, name_en, name_ar, description, description_en, description_ar,
  data_scope, is_system, is_system_role, is_creator_role, is_assignable, is_active, is_trial, tenant_id
) VALUES
  ('admin', 'Admin', 'Admin', 'مدير النظام', 'Full school administration', 'Full school administration', 'إدارة المدرسة بالكامل', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('creator', 'Creator', 'Creator', 'المنشئ', 'Platform owner', 'Platform owner — full access', 'مالك المنصة — صلاحيات كاملة', 'all', TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, NULL),
  ('ceo', 'CEO', 'CEO', 'الرئيس التنفيذي', 'Executive oversight', 'Executive oversight and reports', 'إشراف تنفيذي وتقارير', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('cfo', 'CFO', 'CFO', 'المدير المالي', 'Finance leadership', 'Finance, fees, payroll amounts, and posting', 'المالية والرسوم ومبالغ الرواتب والترحيل', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('coo', 'COO', 'COO', 'مدير العمليات', 'Operations oversight', 'Operations oversight', 'إشراف على العمليات', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('chro', 'CHRO', 'CHRO', 'رئيس الموارد البشرية', 'Workforce strategy', 'Workforce strategy and salary visibility', 'استراتيجية القوى العاملة وعرض الرواتب', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('hr_head', 'HR Head', 'HR Head', 'رئيس الموارد البشرية التشغيلي', 'HR operations', 'HR operations including payroll and EOSB', 'عمليات الموارد البشرية بما فيها الرواتب', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('hr_admin', 'HR Admin', 'HR Admin', 'مدير الموارد البشرية', 'HR administration', 'Employees, attendance, leaves, and payroll', 'الموظفون والحضور والإجازات والرواتب', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('hr_officer', 'HR Officer', 'HR Officer', 'موظف موارد بشرية', 'HR operations', 'Employees, attendance, and leaves', 'الموظفون والحضور والإجازات', 'branch', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('finance', 'Finance Officer', 'Finance Officer', 'مالية', 'Finance officer', 'Fees, finance, procurement, and payroll approval', 'الرسوم والمالية والمشتريات واعتماد الرواتب', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('accountant', 'Accountant', 'Accountant', 'محاسب', 'Accountant', 'Fees, invoices, and finance entries', 'الرسوم والفواتير والقيود المالية', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('branch_manager', 'Branch Manager', 'Branch Manager', 'مدير الفرع', 'Branch oversight', 'Single-branch oversight', 'إشراف على فرع واحد', 'branch', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('admissions', 'Admissions Officer', 'Admissions Officer', 'قبول وتسجيل', 'Admissions', 'Enrolment and student records', 'القبول وسجلات الطلاب', 'branch', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('teacher', 'Teacher', 'Teacher', 'معلم', 'Teacher', 'Student attendance and student records', 'حضور الطلاب وعرض بياناتهم', 'own', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('parent', 'Parent', 'Parent', 'ولي أمر', 'Parent', 'Linked children only', 'الأبناء المرتبطون فقط', 'own', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('procurement', 'Procurement', 'Procurement', 'مشتريات', 'Procurement', 'Vendors, requisitions, and purchase orders', 'الموردون وطلبات الشراء وأوامر الشراء', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('collections', 'Collections', 'Collections', 'التحصيل', 'Collections', 'Fee collections and parent follow-up', 'تحصيل الرسوم ومتابعة أولياء الأمور', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('auditor', 'Auditor', 'Auditor', 'مراجع داخلي', 'Auditor', 'Read-only finance and audit logs', 'قراءة المالية وسجل المراجعة', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('crm_agent', 'CRM Agent', 'CRM Agent', 'وكيل خدمة العملاء', 'CRM', 'Parent communications and CRM', 'التواصل مع أولياء الأمور وخدمة العملاء', 'branch', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('it_admin', 'IT Admin', 'IT Admin', 'مدير تقنية المعلومات', 'IT admin', 'Integrations, settings, and audit logs', 'التكاملات والإعدادات وسجل المراجعة', 'all', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('it_support', 'IT Support', 'IT Support', 'دعم تقنية المعلومات', 'IT support', 'Help desk and device support', 'مكتب المساعدة ودعم الأجهزة', 'branch', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('it_user', 'IT User', 'IT User', 'مستخدم تقنية المعلومات', 'IT user', 'Settings and user administration', 'الإعدادات وإدارة المستخدمين', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('facilities_manager', 'Facilities Manager', 'Facilities Manager', 'مدير المرافق', 'Facilities', 'Facilities and fleet', 'المرافق والأسطول', 'branch', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('content_manager', 'Content Manager', 'Content Manager', 'مدير المحتوى', 'Content', 'Communications and content', 'الاتصالات والمحتوى', 'company', TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, NULL),
  ('unassigned', 'Pending Assignment', 'Pending Assignment', 'بانتظار التعيين', 'Unassigned', 'Least-privileged placeholder until an admin assigns a role', 'صلاحيات دنيا حتى يعيّن المسؤول دوراً', 'own', TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, NULL)
ON CONFLICT (role_code) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  description = EXCLUDED.description,
  description_en = EXCLUDED.description_en,
  description_ar = EXCLUDED.description_ar,
  data_scope = EXCLUDED.data_scope,
  is_system = TRUE,
  is_system_role = TRUE,
  is_creator_role = EXCLUDED.is_creator_role,
  is_assignable = EXCLUDED.is_assignable,
  is_active = TRUE;
