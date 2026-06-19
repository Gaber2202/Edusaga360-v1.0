-- ============================================================
-- EduSaga 360 — Cheque Payment Lifecycle (PDC tracking)
-- Migration: 20260619_cheque_lifecycle.sql
--
-- Post-dated cheques (PDCs) are common in KSA. This tracks each cheque
-- through its lifecycle and (in the application layer) syncs the linked
-- invoice's payment status when a cheque clears or bounces.
-- ============================================================

-- ── Cheques ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cheques (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cheque_number   TEXT NOT NULL,
  bank_name       TEXT,
  drawer_name     TEXT,                         -- who wrote the cheque (parent/guardian)
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL DEFAULT 'SAR',
  issue_date      DATE,
  due_date        DATE,                         -- clearing date; a future date = PDC
  status          TEXT NOT NULL DEFAULT 'received',
                  -- received | pending_deposit | deposited | cleared | bounced | reconciled | cancelled
  invoice_id      UUID,                         -- linked invoice (nullable)
  student_id      UUID,
  payment_id      UUID,                         -- payments row created on clearance
  bounce_reason   TEXT,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheques_tenant_status ON cheques (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cheques_tenant_due    ON cheques (tenant_id, due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_invoice       ON cheques (tenant_id, invoice_id);

-- ── Cheque status history (audit trail of transitions) ──────────────────────
CREATE TABLE IF NOT EXISTS cheque_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cheque_id       UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  note            TEXT,
  changed_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheque_history_cheque ON cheque_status_history (tenant_id, cheque_id);

-- ── RLS policies (tenant isolation — identical pattern to billing engine) ────
ALTER TABLE cheques               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_status_history ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['cheques','cheque_status_history']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_iso ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_tenant_iso ON %I FOR ALL
       USING (tenant_id::text = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',
      tbl, tbl
    );
  END LOOP;
END $$;
