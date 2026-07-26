-- Recurring invoice schedules for termly/monthly/quarterly/annual fee generation.
-- One schedule per student/fee combination; proration configurable per schedule.

CREATE TABLE IF NOT EXISTS recurring_invoice_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  student_id      UUID NOT NULL REFERENCES students(id),
  fee_structure_id UUID REFERENCES fee_structures(id),
  category_id     UUID REFERENCES fee_categories(id),
  frequency       TEXT NOT NULL CHECK (frequency IN ('termly', 'monthly', 'quarterly', 'annual')),
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  start_date      DATE NOT NULL,
  end_date        DATE, -- null = ongoing until cancelled
  next_due_date   DATE NOT NULL,
  last_generated_at TIMESTAMPTZ,
  proration_rule  TEXT NOT NULL DEFAULT 'full_period' CHECK (proration_rule IN ('full_period', 'daily')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  academic_year   TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recurring_invoice_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
    'recurring_invoice_schedules', 'recurring_invoice_schedules'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_tenant_due
  ON recurring_invoice_schedules (tenant_id, next_due_date)
  WHERE status = 'active';

-- Link generated invoices back to their schedule for traceability.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recurring_schedule_id UUID REFERENCES recurring_invoice_schedules(id);

CREATE INDEX IF NOT EXISTS idx_invoices_recurring_schedule
  ON invoices (tenant_id, recurring_schedule_id);
