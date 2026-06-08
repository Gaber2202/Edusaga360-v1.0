-- ============================================================
-- EduSaga 360 — Saudi School Billing Engine
-- Migration: 20260608_billing_engine.sql
-- ============================================================

-- ── Fee categories (VAT-aware per ZATCA / GAZT rules) ──────────────────────
CREATE TABLE IF NOT EXISTS fee_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,               -- e.g. TUITION, TRANSPORT, UNIFORM
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  vat_treatment   TEXT NOT NULL DEFAULT 'standard', -- standard (15%) | exempt | zero_rated
  gl_revenue_code TEXT,                        -- maps to chart_of_accounts.code
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Seed standard Saudi fee categories (VAT treatment per ZATCA circular)
-- Tuition is VAT-exempt; ancillary services are 15% standard-rated
INSERT INTO fee_categories (id, tenant_id, code, name_ar, name_en, vat_treatment)
SELECT
  gen_random_uuid(),
  id,
  c.code, c.name_ar, c.name_en, c.vat
FROM tenants
CROSS JOIN (VALUES
  ('TUITION',       'الرسوم الدراسية',    'Tuition',        'exempt'),
  ('REGISTRATION',  'رسوم التسجيل',       'Registration',   'exempt'),
  ('REENROLLMENT',  'رسوم إعادة التسجيل', 'Re-enrollment',  'exempt'),
  ('TRANSPORT',     'المواصلات',           'Transport',      'standard'),
  ('MEALS',         'وجبات',               'Meals',          'standard'),
  ('UNIFORM',       'الزي المدرسي',        'Uniforms',       'standard'),
  ('BOOKS',         'الكتب والمستلزمات',   'Books/Materials','standard'),
  ('ACTIVITIES',    'الأنشطة',             'Activities',     'standard'),
  ('EXAMS',         'رسوم الاختبارات',     'Exams',          'exempt'),
  ('LATE_FEE',      'غرامة التأخير',       'Late Fee',       'standard'),
  ('OTHER',         'أخرى',                'Other',          'standard')
) AS c(code, name_ar, name_en, vat)
ON CONFLICT DO NOTHING;

-- ── Fee structures (per grade / academic year / category) ──────────────────
CREATE TABLE IF NOT EXISTS fee_structures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year   TEXT NOT NULL,               -- e.g. '2025-2026'
  category_id     UUID REFERENCES fee_categories(id),
  grade           TEXT,                        -- null = school-wide
  campus_id       UUID,                        -- null = all campuses
  program         TEXT,                        -- e.g. 'national' | 'international'
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'SAR',
  is_mandatory    BOOLEAN NOT NULL DEFAULT true,
  installment_count INT NOT NULL DEFAULT 1,    -- 1 = lump-sum, >1 = split equally
  notes_ar        TEXT,
  notes_en        TEXT,
  effective_from  DATE,
  effective_to    DATE,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_tenant_year ON fee_structures (tenant_id, academic_year);

-- ── Discount rules engine ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  discount_type   TEXT NOT NULL,   -- sibling | scholarship | staff | early_bird | bulk | custom
  calculation     TEXT NOT NULL,   -- percentage | fixed_amount
  value           NUMERIC(10,2) NOT NULL CHECK (value >= 0),
  max_amount      NUMERIC(12,2),   -- cap for percentage discounts
  applies_to      TEXT NOT NULL DEFAULT 'all',  -- all | category_ids (JSON array)
  conditions      JSONB,           -- e.g. {"sibling_rank": 2, "min_siblings": 2}
  stacking        TEXT NOT NULL DEFAULT 'allowed', -- allowed | blocked | override
  priority        INT NOT NULL DEFAULT 100,    -- lower = applied first
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  academic_year   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- ── Payment plans (installment schedules) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL,
  academic_year   TEXT NOT NULL,
  plan_type       TEXT NOT NULL,   -- term | monthly | custom
  total_amount    NUMERIC(12,2) NOT NULL,
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',  -- active | completed | cancelled | defaulted
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_plan_installments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  installment_no  INT NOT NULL,
  due_date        DATE NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | overdue | waived
  invoice_id      UUID,
  paid_date       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppi_plan ON payment_plan_installments (plan_id);
CREATE INDEX IF NOT EXISTS idx_ppi_due  ON payment_plan_installments (tenant_id, due_date, status);

-- ── Invoice applied discounts (audit trail) ────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_discounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL,
  discount_rule_id UUID REFERENCES discount_rules(id),
  discount_code   TEXT NOT NULL,
  description_ar  TEXT,
  description_en  TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ZATCA submission log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zatca_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      UUID,
  invoice_number  TEXT NOT NULL,
  submission_type TEXT NOT NULL,   -- clearance | reporting | credit_note
  zatca_uuid      TEXT,            -- UUID assigned by ZATCA
  invoice_hash    TEXT,
  previous_hash   TEXT,            -- hash chaining
  ubl_xml         TEXT,
  qr_code         TEXT,
  pdf_base64      TEXT,
  zatca_status    TEXT NOT NULL DEFAULT 'pending', -- pending | submitted | cleared | reported | rejected | error
  zatca_response  JSONB,
  clearance_number TEXT,
  submitted_at    TIMESTAMPTZ,
  cleared_at      TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zatca_invoice ON zatca_submissions (tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_zatca_status  ON zatca_submissions (tenant_id, zatca_status);

-- ── Dunning log (collection actions) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS dunning_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL,
  student_id      UUID,
  channel         TEXT NOT NULL,   -- whatsapp | sms | email | in_app
  action          TEXT NOT NULL,   -- reminder_1 | reminder_2 | overdue_notice | final_notice
  days_overdue    INT,
  message_ar      TEXT,
  message_en      TEXT,
  sent_to         TEXT,            -- phone or email
  status          TEXT NOT NULL DEFAULT 'sent',  -- sent | delivered | failed
  response        JSONB,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS policies ────────────────────────────────────────────────────────────
ALTER TABLE fee_categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures              ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_installments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_discounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE zatca_submissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_log                 ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['fee_categories','fee_structures','discount_rules',
    'payment_plans','payment_plan_installments','invoice_discounts',
    'zatca_submissions','dunning_log']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_iso ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_iso ON %I FOR ALL
       USING (tenant_id::text = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',
      tbl, tbl
    );
  END LOOP;
END $$;
