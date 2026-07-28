-- ============================================================
-- Executive Command Center v2: query performance indexes
-- ============================================================
-- Additive & idempotent. These indexes support the KPI snapshot
-- computations and day-to-day dashboard loads under the main
-- tenant/branch/date filters.

-- Invoices: the heaviest table for dashboard financials.
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date_status
  ON invoices (tenant_id, date DESC, status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_branch_date_status
  ON invoices (tenant_id, branch_id, date DESC, status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status_duedate
  ON invoices (tenant_id, status, due_date)
  WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_academic_year_status
  ON invoices (tenant_id, academic_year, status);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date_status
  ON expenses (tenant_id, date DESC, status);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch_date_status
  ON expenses (tenant_id, branch_id, date DESC, status);

-- Payments (cash collected)
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date
  ON payments (tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_branch_date
  ON payments (tenant_id, branch_id, date DESC);

-- Students / enrollment
CREATE INDEX IF NOT EXISTS idx_students_tenant_status
  ON students (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_students_tenant_academic_year
  ON students (tenant_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_students_tenant_branch_status
  ON students (tenant_id, branch_id, status);

-- Employees / HR
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status
  ON employees (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_branch_status
  ON employees (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_iqama_expiry
  ON employees (tenant_id, iqama_expiry)
  WHERE iqama_expiry IS NOT NULL AND status = 'active';

-- Attendance
CREATE INDEX IF NOT EXISTS idx_employee_attendance_tenant_date
  ON employee_attendance (tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_attendance_tenant_branch_date
  ON employee_attendance (tenant_id, branch_id, date DESC);

-- Capacity / admissions
CREATE INDEX IF NOT EXISTS idx_sections_tenant_branch
  ON sections (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_applicants_tenant_branch_status
  ON applicants (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_tenant_branch_stage
  ON applications (tenant_id, branch_id, stage);

-- Academic years lookup
CREATE INDEX IF NOT EXISTS idx_academic_years_tenant_start
  ON academic_years (tenant_id, start_date DESC);

-- Installments (collections forecast)
CREATE INDEX IF NOT EXISTS idx_payment_plan_installments_tenant_due_date_status
  ON payment_plan_installments (tenant_id, due_date, status);
