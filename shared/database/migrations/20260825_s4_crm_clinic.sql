-- SCRUM-130 / SCRUM-131: CRM customers + Lead→Qualified pipeline stage
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  customer_number TEXT,
  customer_type TEXT DEFAULT 'individual',
  name_ar TEXT,
  name_en TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  segment TEXT DEFAULT 'prospect',
  pipeline_stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (pipeline_stage IN ('lead', 'qualified')),
  admissions_application_id UUID,
  total_interactions INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_pipeline ON customers (tenant_id, pipeline_stage);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY customers_tenant ON customers
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SCRUM-136: clinic visit persistence
CREATE TABLE IF NOT EXISTS clinic_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),
  student_name TEXT,
  grade TEXT,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_time TIME,
  complaint_category TEXT,
  temperature NUMERIC(4,1),
  blood_pressure TEXT,
  pulse INTEGER,
  spo2 INTEGER,
  assessment TEXT,
  treatment_given TEXT,
  medication_dispensed TEXT,
  medication_dose TEXT,
  outcome TEXT,
  parent_notified BOOLEAN DEFAULT false,
  parent_notified_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_visits_tenant ON clinic_visits (tenant_id, created_at DESC);

ALTER TABLE clinic_visits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY clinic_visits_tenant ON clinic_visits
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Optional health records for allergy warnings / vaccinations (SCRUM-136/137 follow-on)
CREATE TABLE IF NOT EXISTS student_health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id),
  allergies JSONB DEFAULT '[]'::jsonb,
  vaccinations JSONB DEFAULT '[]'::jsonb,
  chronic_conditions JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_health_records_tenant ON student_health_records (tenant_id);

ALTER TABLE student_health_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY student_health_records_tenant ON student_health_records
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SCRUM-131: CRM sales activities (Lead → Qualified)
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN (
      'created', 'note', 'call', 'email', 'meeting',
      'stage_change', 'qualified', 'application_linked'
    )),
  subject TEXT,
  body TEXT,
  from_stage TEXT,
  to_stage TEXT,
  admissions_application_id UUID,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_customer
  ON crm_activities (tenant_id, customer_id, created_at DESC);

ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_activities_tenant ON crm_activities
    USING ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid = tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
