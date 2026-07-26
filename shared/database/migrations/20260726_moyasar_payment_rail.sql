-- ============================================================================
-- 20260726_moyasar_payment_rail.sql
--
-- Moyasar payment gateway integration tables: map EduSaga invoices/installments
-- to Moyasar invoices/payments, record webhook events for idempotency, and
-- queue refund review requests.
-- ============================================================================

CREATE TABLE IF NOT EXISTS moyasar_invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  moyasar_id            uuid NOT NULL,
  edusaga_invoice_id    uuid REFERENCES invoices(id),
  edusaga_installment_id uuid REFERENCES payment_plan_installments(id),
  amount_halala         integer NOT NULL,
  currency              text NOT NULL DEFAULT 'SAR',
  status                text NOT NULL DEFAULT 'initiated',
  payment_url           text,
  callback_url          text,
  success_url           text,
  back_url              text,
  expired_at            timestamptz,
  metadata              jsonb NOT NULL DEFAULT '{}',
  version               integer NOT NULL DEFAULT 1,
  cancelled_at          timestamptz,
  cancelled_reason      text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moyasar_invoices_moyasar_id
  ON moyasar_invoices (tenant_id, moyasar_id);
CREATE INDEX IF NOT EXISTS idx_moyasar_invoices_edusaga_invoice
  ON moyasar_invoices (tenant_id, edusaga_invoice_id);
CREATE INDEX IF NOT EXISTS idx_moyasar_invoices_status
  ON moyasar_invoices (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS moyasar_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  moyasar_payment_id    text NOT NULL,
  moyasar_invoice_id    uuid REFERENCES moyasar_invoices(id),
  edusaga_payment_id    uuid REFERENCES payments(id),
  amount_halala         integer NOT NULL,
  fee_halala            integer NOT NULL DEFAULT 0,
  refunded_halala       integer NOT NULL DEFAULT 0,
  captured_halala       integer NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'SAR',
  status                text NOT NULL,
  payment_method        text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  payload               jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moyasar_payments_moyasar_payment_id
  ON moyasar_payments (tenant_id, moyasar_payment_id);
CREATE INDEX IF NOT EXISTS idx_moyasar_payments_invoice
  ON moyasar_payments (tenant_id, moyasar_invoice_id);

CREATE TABLE IF NOT EXISTS moyasar_webhook_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id              text NOT NULL,
  event_type            text NOT NULL,
  moyasar_payment_id    text,
  moyasar_invoice_id    text,
  payload               jsonb NOT NULL DEFAULT '{}',
  processed_at          timestamptz,
  processing_error      text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moyasar_webhook_events_id
  ON moyasar_webhook_events (tenant_id, event_id);
CREATE INDEX IF NOT EXISTS idx_moyasar_webhook_events_created
  ON moyasar_webhook_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moyasar_refund_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  edusaga_invoice_id    uuid REFERENCES invoices(id),
  edusaga_payment_id    uuid REFERENCES payments(id),
  credit_note_id        uuid REFERENCES invoices(id),
  moyasar_payment_id    text,
  amount_halala         integer,
  status                text NOT NULL DEFAULT 'pending_review',
  reason                text,
  requested_by          text,
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moyasar_refund_queue_status
  ON moyasar_refund_queue (tenant_id, status, created_at DESC);

-- Tenant-level payment settings (v1 single-account; per-tenant Vault key references later)
ALTER TABLE tenant_compliance_settings
  ADD COLUMN IF NOT EXISTS moyasar_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moyasar_test_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_link_expiry_hours integer NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS refund_approval_threshold_sar NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Tenant isolation
ALTER TABLE moyasar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE moyasar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE moyasar_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE moyasar_refund_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moyasar_invoices_tenant_iso ON moyasar_invoices;
CREATE POLICY moyasar_invoices_tenant_iso ON moyasar_invoices
  FOR ALL
  USING ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))
  WITH CHECK ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')));

DROP POLICY IF EXISTS moyasar_payments_tenant_iso ON moyasar_payments;
CREATE POLICY moyasar_payments_tenant_iso ON moyasar_payments
  FOR ALL
  USING ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))
  WITH CHECK ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')));

DROP POLICY IF EXISTS moyasar_webhook_events_tenant_iso ON moyasar_webhook_events;
CREATE POLICY moyasar_webhook_events_tenant_iso ON moyasar_webhook_events
  FOR ALL
  USING ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))
  WITH CHECK ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')));

DROP POLICY IF EXISTS moyasar_refund_queue_tenant_iso ON moyasar_refund_queue;
CREATE POLICY moyasar_refund_queue_tenant_iso ON moyasar_refund_queue
  FOR ALL
  USING ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')))
  WITH CHECK ((tenant_id)::text = (SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')));
