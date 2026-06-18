-- =============================================================================
-- DEMO SEED DATA — Invoice generation demo
-- Seeds fee categories and sample students for an existing active tenant
-- Safe to re-run (uses ON CONFLICT DO NOTHING / IF NOT EXISTS checks)
-- =============================================================================

-- Seed fee categories for all tenants that don't have them yet
INSERT INTO fee_categories (id, tenant_id, code, name_ar, name_en, vat_treatment)
SELECT
  gen_random_uuid(),
  t.id,
  c.code, c.name_ar, c.name_en, c.vat
FROM tenants t
CROSS JOIN (VALUES
  ('TUITION',       'الرسوم الدراسية',    'Tuition',        'exempt'),
  ('REGISTRATION',  'رسوم التسجيل',       'Registration',   'exempt'),
  ('TRANSPORT',     'المواصلات',           'Transport',      'standard'),
  ('MEALS',         'وجبات',               'Meals',          'standard'),
  ('UNIFORM',       'الزي المدرسي',        'Uniforms',       'standard'),
  ('BOOKS',         'الكتب والمستلزمات',   'Books/Materials','standard'),
  ('ACTIVITIES',    'الأنشطة',             'Activities',     'standard'),
  ('LATE_FEE',      'غرامة التأخير',       'Late Fee',       'standard')
) AS c(code, name_ar, name_en, vat)
WHERE NOT EXISTS (
  SELECT 1 FROM fee_categories fc WHERE fc.tenant_id = t.id AND fc.code = c.code
);

-- Seed demo students for the first active tenant (if no students exist)
DO $$
DECLARE
  v_tenant_id UUID;
  v_branch_id UUID;
BEGIN
  -- Get first active tenant
  SELECT id INTO v_tenant_id FROM tenants WHERE status IN ('active', 'trial') ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  -- Check if students already exist for this tenant
  IF EXISTS (SELECT 1 FROM students WHERE tenant_id = v_tenant_id LIMIT 1) THEN RETURN; END IF;

  -- Get a branch (or null)
  SELECT id INTO v_branch_id FROM branches WHERE tenant_id = v_tenant_id LIMIT 1;

  -- Insert demo students
  INSERT INTO students (id, tenant_id, branch_id, name_en, name_ar, grade, status, student_number, nationality, gender, date_of_birth, enrollment_date)
  VALUES
    (gen_random_uuid(), v_tenant_id, v_branch_id, 'Ahmed Al-Rashid', 'أحمد الراشد', 'Grade1', 'active', 'STU-2025-001', 'Saudi', 'male', '2018-03-15', '2025-09-01'),
    (gen_random_uuid(), v_tenant_id, v_branch_id, 'Fatima Al-Saud', 'فاطمة آل سعود', 'Grade2', 'active', 'STU-2025-002', 'Saudi', 'female', '2017-06-22', '2025-09-01'),
    (gen_random_uuid(), v_tenant_id, v_branch_id, 'Omar Hassan', 'عمر حسن', 'Grade3', 'active', 'STU-2025-003', 'Egyptian', 'male', '2016-11-08', '2025-09-01'),
    (gen_random_uuid(), v_tenant_id, v_branch_id, 'Layla Ibrahim', 'ليلى إبراهيم', 'KG1', 'active', 'STU-2025-004', 'Saudi', 'female', '2020-01-30', '2025-09-01'),
    (gen_random_uuid(), v_tenant_id, v_branch_id, 'Khalid Mohammed', 'خالد محمد', 'Grade5', 'active', 'STU-2025-005', 'Saudi', 'male', '2014-08-12', '2025-09-01');
END $$;
