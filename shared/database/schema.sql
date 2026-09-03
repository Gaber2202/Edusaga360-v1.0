-- EduSaga 360 — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor to set up the database.
-- All tenant-scoped tables include tenant_id with RLS policies.

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- PLATFORM & MULTI-TENANCY
-- =============================================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  slug TEXT UNIQUE,
  tenant_code TEXT UNIQUE,            -- short human-readable code e.g. T-K3F2A
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'trial')),
  plan TEXT DEFAULT 'basic',
  admin_email TEXT,                   -- primary admin contact email
  city TEXT,
  school_type TEXT,                   -- government | private | international
  trial_end_date DATE,                -- when the trial period expires
  onboarding_completed BOOLEAN DEFAULT FALSE,
  logo_url TEXT,
  academic_year_start DATE,
  num_grades INTEGER,
  default_language TEXT DEFAULT 'ar',
  -- usage counters (updated by triggers or backend jobs)
  current_employees INTEGER DEFAULT 0,
  max_employees INTEGER DEFAULT 9999,
  current_students INTEGER DEFAULT 0,
  max_students INTEGER DEFAULT 9999,
  current_branches INTEGER DEFAULT 0,
  max_branches INTEGER DEFAULT 9999,
  yamen_ai_used_this_month INTEGER DEFAULT 0,
  yamen_ai_monthly_limit INTEGER DEFAULT 100,
  enabled_modules TEXT[] DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  code TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_main BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,
  name_ar TEXT,
  description TEXT,
  description_en TEXT,
  description_ar TEXT,
  permissions JSONB DEFAULT '[]',
  module_access JSONB DEFAULT '{}'::jsonb,
  action_permissions JSONB DEFAULT '{}'::jsonb,
  data_scope TEXT DEFAULT 'branch',
  is_system BOOLEAN DEFAULT FALSE,
  is_system_role BOOLEAN DEFAULT FALSE,
  is_creator_role BOOLEAN DEFAULT FALSE,
  is_assignable BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  is_trial BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  last_modified_by TEXT,
  last_modified_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE, -- References Supabase auth.users
  tenant_id UUID REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  role_id UUID REFERENCES roles(id),
  email TEXT NOT NULL,
  name TEXT,
  name_ar TEXT,
  phone TEXT,
  is_platform_owner BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ACADEMICS & STUDENTS
-- =============================================================================

CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  code TEXT,
  level INTEGER,
  capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  grade_id UUID REFERENCES grades(id),
  name TEXT NOT NULL,
  capacity INTEGER,
  teacher_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE guardians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  national_id TEXT,
  phone TEXT,
  email TEXT,
  relation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  student_id TEXT,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  date_of_birth DATE,
  gender TEXT,
  nationality TEXT,
  national_id TEXT,
  grade_id UUID REFERENCES grades(id),
  section_id UUID REFERENCES sections(id),
  guardian_id UUID REFERENCES guardians(id),
  enrollment_type TEXT,
  enrollment_date DATE,
  academic_year UUID REFERENCES academic_years(id),
  status TEXT DEFAULT 'active',
  photo_url TEXT,
  medical_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE student_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  student_id UUID REFERENCES students(id),
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ADMISSIONS
-- =============================================================================

CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  student_name_en TEXT NOT NULL,
  student_name_ar TEXT,
  date_of_birth DATE,
  gender TEXT,
  nationality TEXT,
  national_id TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  grade_applied TEXT,
  academic_year UUID REFERENCES academic_years(id),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  documents JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  applicant_id UUID REFERENCES applicants(id),
  stage TEXT DEFAULT 'submitted',
  decision TEXT,
  reviewer_id UUID,
  interview_date TIMESTAMPTZ,
  assessment_scores JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- FINANCE & ACCOUNTING
-- =============================================================================

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  type TEXT NOT NULL, -- asset, liability, equity, revenue, expense
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT TRUE,
  balance NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'open', -- open, closed, locked
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id), -- NULL = group-level / consolidated
  date DATE NOT NULL,
  reference TEXT,
  description TEXT NOT NULL,
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  total_debit NUMERIC(15,2) NOT NULL,
  total_credit NUMERIC(15,2) NOT NULL,
  status TEXT DEFAULT 'posted',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id), -- mirrors the parent journal_entries.branch_id
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID REFERENCES chart_of_accounts(id),
  debit NUMERIC(15,2) DEFAULT 0,
  credit NUMERIC(15,2) DEFAULT 0,
  description TEXT,
  cost_center_id UUID
);

CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code TEXT,
  name TEXT NOT NULL,
  type TEXT,
  parent_id UUID REFERENCES cost_centers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  code TEXT,
  category TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: This original (Base44) shape was reconciled in migration
-- 20260629_fee_structures_reconcile.sql — `academic_year` is now TEXT, `name` is
-- nullable, and the billing-engine + config-UI columns were added (Option A1).
-- See that migration for the canonical column set.
CREATE TABLE fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  grade_id UUID REFERENCES grades(id),
  academic_year UUID REFERENCES academic_years(id),
  name TEXT NOT NULL,
  total_amount NUMERIC(15,2),
  installment_plan JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id), -- inherited from the student's branch
  student_id UUID REFERENCES students(id),
  invoice_number TEXT,
  date DATE NOT NULL,
  due_date DATE,
  total_amount NUMERIC(15,2) NOT NULL,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, issued, paid, overdue, cancelled
  items JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id), -- inherited from the invoice's branch
  invoice_id UUID REFERENCES invoices(id),
  amount NUMERIC(15,2) NOT NULL,
  method TEXT, -- cash, bank_transfer, card, online
  reference TEXT,
  date DATE NOT NULL,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  category TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  date DATE NOT NULL,
  vendor_id UUID,
  account_id UUID REFERENCES chart_of_accounts(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  tax_number TEXT,
  address TEXT,
  category TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- HR & PAYROLL
-- =============================================================================

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  head_id UUID,
  parent_id UUID REFERENCES departments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_titles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  grade TEXT,
  min_salary NUMERIC(15,2),
  max_salary NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  user_id UUID REFERENCES users(id),
  employee_number TEXT,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT,
  nationality TEXT,
  national_id TEXT,
  iqama_number TEXT,
  iqama_expiry DATE,
  passport_number TEXT,
  department_id UUID REFERENCES departments(id),
  job_title_id UUID REFERENCES job_titles(id),
  join_date DATE,
  contract_end_date DATE,
  employment_type TEXT, -- full_time, part_time, contract, probation
  basic_salary NUMERIC(15,2),
  housing_allowance NUMERIC(15,2),
  transport_allowance NUMERIC(15,2),
  other_allowances JSONB DEFAULT '{}',
  bank_name TEXT,
  bank_iban TEXT,
  status TEXT DEFAULT 'active',
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employee_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID REFERENCES employees(id),
  contract_type TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  probation_end DATE,
  salary NUMERIC(15,2),
  terms JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  days_allowed INTEGER NOT NULL,
  is_paid BOOLEAN DEFAULT TRUE,
  carry_forward BOOLEAN DEFAULT FALSE,
  gender_specific TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID REFERENCES employees(id),
  leave_type_id UUID REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, cancelled
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID REFERENCES employees(id),
  leave_type_id UUID REFERENCES leave_types(id),
  academic_year UUID REFERENCES academic_years(id),
  total_days INTEGER NOT NULL,
  used_days INTEGER DEFAULT 0,
  remaining_days INTEGER GENERATED ALWAYS AS (total_days - used_days) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pay_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, processing, approved, paid
  total_gross NUMERIC(15,2),
  total_deductions NUMERIC(15,2),
  total_net NUMERIC(15,2),
  processed_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payslip_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pay_run_id UUID REFERENCES pay_runs(id),
  employee_id UUID REFERENCES employees(id),
  basic_salary NUMERIC(15,2),
  housing_allowance NUMERIC(15,2),
  transport_allowance NUMERIC(15,2),
  other_allowances NUMERIC(15,2),
  gross_salary NUMERIC(15,2),
  gosi_employee NUMERIC(15,2),
  gosi_employer NUMERIC(15,2),
  loan_deduction NUMERIC(15,2),
  other_deductions NUMERIC(15,2),
  net_salary NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employee_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID REFERENCES employees(id),
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT, -- present, absent, late, half_day, leave
  source TEXT, -- manual, biometric, system
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE overtime_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID REFERENCES employees(id),
  date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL,
  reason TEXT,
  rate_multiplier NUMERIC(3,2) DEFAULT 1.5,
  status TEXT DEFAULT 'pending',
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- OPERATIONS & FACILITIES
-- =============================================================================

CREATE TABLE fixed_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  name TEXT NOT NULL,
  category TEXT,
  serial_number TEXT,
  purchase_date DATE,
  purchase_price NUMERIC(15,2),
  current_value NUMERIC(15,2),
  depreciation_rate NUMERIC(5,2),
  location TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plate_number TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  type TEXT,
  capacity INTEGER,
  driver_id UUID REFERENCES employees(id),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bus_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  name TEXT NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  driver_id UUID REFERENCES employees(id),
  stops JSONB DEFAULT '[]',
  schedule JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  assigned_to UUID,
  reported_by UUID,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- COMMUNICATIONS & NOTIFICATIONS
-- =============================================================================

CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT, -- email, sms, push, in_app
  subject TEXT,
  body TEXT,
  recipients JSONB DEFAULT '[]',
  sender_id UUID,
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CONTRACTS & PROCUREMENT
-- =============================================================================

CREATE TABLE contract_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT,
  content TEXT,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE student_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  student_id UUID REFERENCES students(id),
  template_id UUID REFERENCES contract_templates(id),
  academic_year UUID REFERENCES academic_years(id),
  content TEXT,
  status TEXT DEFAULT 'draft', -- draft, sent, signed, cancelled
  signed_at TIMESTAMPTZ,
  guardian_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  requester_id UUID,
  description TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  total_amount NUMERIC(15,2),
  status TEXT DEFAULT 'pending',
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  requisition_id UUID REFERENCES purchase_requisitions(id),
  vendor_id UUID REFERENCES vendors(id),
  po_number TEXT,
  items JSONB DEFAULT '[]',
  total_amount NUMERIC(15,2),
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PLATFORM ADMINISTRATION
-- =============================================================================

CREATE TABLE registration_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_name_en TEXT,
  school_name_ar TEXT,
  contact_name TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  school_type TEXT,
  city TEXT,
  country TEXT DEFAULT 'SA',
  student_count_range TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending', -- pending, approved, denied, completed
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  onboarding_token TEXT,
  token_expires_at TIMESTAMPTZ,
  tenant_id UUID REFERENCES tenants(id),
  approved_at TIMESTAMPTZ,
  denied_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  submitted_by UUID,
  resolved_by UUID,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  module TEXT,
  action TEXT,
  message TEXT,
  stack TEXT,
  severity TEXT DEFAULT 'error',
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- REFERENCE DATA
-- =============================================================================

CREATE TABLE countries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  phone_code TEXT
);

CREATE TABLE currencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  symbol TEXT
);

CREATE TABLE public_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (tenant isolation)
-- Example policy for branches (repeat for all tenant-scoped tables):

CREATE POLICY "tenant_isolation" ON branches
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation" ON students
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation" ON employees
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation" ON invoices
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY "tenant_isolation" ON journal_entries
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- RLS policies for all remaining tenant-scoped tables.
-- Pattern: rows are visible/writable only when tenant_id matches the JWT claim.
-- The service-role key bypasses RLS for backend operations.

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'guardians','academic_years','grades','sections',
    'applicants','applications',
    'chart_of_accounts','fiscal_periods','journal_entry_lines','cost_centers',
    'fee_types','fee_structures','payments','expenses','vendors',
    'departments','job_titles','employee_contracts',
    'leave_types','leave_requests','leave_balances',
    'pay_runs','payslip_lines','employee_attendance','overtime_requests',
    'fixed_assets','vehicles','bus_routes','service_tickets',
    'communications','notifications','contract_templates','student_contracts',
    'purchase_requisitions','purchase_orders','student_tags','audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Only create if policy doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = (auth.jwt() ->> ''tenant_id'')::UUID) WITH CHECK (tenant_id = (auth.jwt() ->> ''tenant_id'')::UUID)',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_students_tenant ON students(tenant_id);
CREATE INDEX idx_students_branch ON students(branch_id);
CREATE INDEX idx_students_grade ON students(grade_id);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_branch ON employees(branch_id);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_student ON invoices(student_id);
CREATE INDEX idx_invoices_branch ON invoices(branch_id);
CREATE INDEX idx_journal_entries_tenant ON journal_entries(tenant_id);
CREATE INDEX idx_journal_entries_branch ON journal_entries(branch_id);
CREATE INDEX idx_journal_entry_lines_branch ON journal_entry_lines(branch_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_branch ON payments(branch_id);
CREATE INDEX idx_leave_requests_tenant ON leave_requests(tenant_id);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
