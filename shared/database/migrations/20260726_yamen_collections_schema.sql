-- ============================================================================
-- 20260726_yamen_collections_schema.sql
--
-- YAMEN AI Collections Agent + Collection-Rate Guarantee Engine (v1).
-- Extends the existing billing/messaging/audit schema with tenant-scoped,
-- RLS-protected tables. Reuses invoices/payments/payment_plans/guardians.
-- All new tables include tenant_id and tenant_isolation policy.
-- Append-only tables are protected by immutable triggers.
-- ============================================================================

-- Ensure pgcrypto is available for gen_random_uuid() and hashing.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Extend existing payment_plans for offer/agent/broken detection
-- ============================================================================
ALTER TABLE payment_plans
  ADD COLUMN IF NOT EXISTS offer_status TEXT DEFAULT NULL, -- offered | accepted | declined | expired | active | completed | broken
  ADD COLUMN IF NOT EXISTS offered_by_agent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sequence_id UUID,
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS source_invoice_id UUID,
  ADD COLUMN IF NOT EXISTS down_payment_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broken_reason TEXT;

ALTER TABLE payment_plan_installments
  ADD COLUMN IF NOT EXISTS moyasar_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS collection_message_id UUID;

-- ============================================================================
-- 2. Tenant-scoped agent settings & kill switch
-- ============================================================================
CREATE TABLE IF NOT EXISTS collection_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  send_window_start TIME NOT NULL DEFAULT '10:00:00',
  send_window_end   TIME NOT NULL DEFAULT '20:00:00',
  timezone          TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  respect_friday_prayer BOOLEAN NOT NULL DEFAULT TRUE,
  respect_ramadan   BOOLEAN NOT NULL DEFAULT TRUE,
  min_down_payment_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  max_installments  INT NOT NULL DEFAULT 4,
  max_plan_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  segment_rules     JSONB NOT NULL DEFAULT '{}',
  escalation_config JSONB NOT NULL DEFAULT '{}',
  channels_priority TEXT[] NOT NULL DEFAULT ARRAY['whatsapp','sms','email'],
  kill_switch_activated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- ============================================================================
-- 3. Collection profiles & segments
-- ============================================================================
CREATE TABLE IF NOT EXISTS collection_profiles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  guardian_id                 UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  student_id                  UUID REFERENCES students(id) ON DELETE SET NULL,
  current_segment             TEXT NOT NULL DEFAULT 'B', -- A | B | C | D | E
  avg_days_to_pay             NUMERIC(8,2) DEFAULT 0,
  missed_installments_count   INT NOT NULL DEFAULT 0,
  partial_payment_ratio       NUMERIC(5,4) NOT NULL DEFAULT 0,
  channel_responsiveness      JSONB NOT NULL DEFAULT '{}',
  preferred_language          TEXT NOT NULL DEFAULT 'ar',
  preferred_contact_window    JSONB,
  total_invoiced              NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_collected             NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_balance         NUMERIC(15,2) NOT NULL DEFAULT 0,
  last_contact_at             TIMESTAMPTZ,
  last_payment_at             TIMESTAMPTZ,
  features_jsonb              JSONB NOT NULL DEFAULT '{}',
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, guardian_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_profiles_tenant_segment ON collection_profiles (tenant_id, current_segment);
CREATE INDEX IF NOT EXISTS idx_collection_profiles_guardian ON collection_profiles (tenant_id, guardian_id);

CREATE TABLE IF NOT EXISTS collection_segments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES collection_profiles(id) ON DELETE CASCADE,
  segment           TEXT NOT NULL, -- A | B | C | D | E
  features_snapshot JSONB NOT NULL DEFAULT '{}',
  scoring_model     TEXT NOT NULL DEFAULT 'rule_v1',
  confidence        NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_segments_profile ON collection_segments (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_segments_tenant ON collection_segments (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collection_sequences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  segment           TEXT NOT NULL, -- A | B | C | D | E
  sequence_definition JSONB NOT NULL DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  version           INT NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, segment, version)
);

-- ============================================================================
-- 4. Collection messages & inbound replies
-- ============================================================================
CREATE TABLE IF NOT EXISTS collection_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id            UUID NOT NULL REFERENCES collection_profiles(id) ON DELETE CASCADE,
  invoice_id            UUID REFERENCES invoices(id) ON DELETE SET NULL,
  plan_id               UUID REFERENCES payment_plans(id) ON DELETE SET NULL,
  sequence_id           UUID REFERENCES collection_sequences(id) ON DELETE SET NULL,
  sequence_step         INT,
  channel               TEXT NOT NULL, -- whatsapp | sms | email | in_app
  template_key          TEXT NOT NULL,
  language              TEXT NOT NULL DEFAULT 'ar',
  personalized_body_ar  TEXT,
  personalized_body_en  TEXT,
  amount_due            NUMERIC(15,2),
  due_date              DATE,
  moyasar_link          TEXT,
  sent_to               TEXT,
  scheduled_at          TIMESTAMPTZ NOT NULL,
  sent_at               TIMESTAMPTZ,
  delivery_status       TEXT NOT NULL DEFAULT 'pending', -- pending | sent | delivered | read | failed | bounced
  delivery_response     JSONB,
  idempotency_key       TEXT NOT NULL,
  reply_class           TEXT, -- paid_claim | dispute | hardship | promise_to_pay | opt_out | other | none
  reply_raw             TEXT,
  reply_at              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_collection_messages_profile ON collection_messages (profile_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_messages_invoice ON collection_messages (tenant_id, invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_messages_status ON collection_messages (tenant_id, delivery_status, scheduled_at);

CREATE TABLE IF NOT EXISTS collection_message_replies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id            UUID NOT NULL REFERENCES collection_messages(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL,
  from_number_or_email  TEXT,
  raw_body              TEXT,
  classified_as         TEXT, -- paid_claim | dispute | hardship | promise_to_pay | opt_out | other
  confidence            NUMERIC(4,3),
  model_version         TEXT,
  routed_to_queue       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_message_replies_message ON collection_message_replies (message_id, created_at DESC);

-- ============================================================================
-- 5. Installment-plan offers (agent negotiation state)
-- ============================================================================
CREATE TABLE IF NOT EXISTS installment_plan_offers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id          UUID NOT NULL REFERENCES collection_profiles(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sequence_id         UUID REFERENCES collection_sequences(id) ON DELETE SET NULL,
  proposed_down_payment_pct NUMERIC(5,2) NOT NULL,
  installment_count   INT NOT NULL,
  first_installment_days INT NOT NULL DEFAULT 30,
  recurring_days      INT NOT NULL DEFAULT 30,
  total_amount        NUMERIC(15,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'proposed', -- proposed | pending_approval | accepted | declined | expired | converted
  requires_approval   BOOLEAN NOT NULL DEFAULT FALSE,
  approval_queue_id   UUID,
  accepted_plan_id    UUID REFERENCES payment_plans(id) ON DELETE SET NULL,
  expired_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_plan_offers_profile ON installment_plan_offers (profile_id, status);
CREATE INDEX IF NOT EXISTS idx_installment_plan_offers_invoice ON installment_plan_offers (tenant_id, invoice_id);

-- ============================================================================
-- 6. Immutable agent ledger & approval queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_actions_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_type       TEXT NOT NULL, -- segment | message | plan_offer | escalation | approval | reconciliation | reply_classify | kill_switch
  actor             TEXT NOT NULL DEFAULT 'yamen', -- yamen | user | system
  reference_table   TEXT,
  reference_id      UUID,
  input_snapshot    JSONB NOT NULL DEFAULT '{}',
  input_snapshot_hash TEXT,
  model_version     TEXT,
  rule_version      TEXT NOT NULL DEFAULT 'rule_v1',
  confidence        NUMERIC(4,3),
  decision          TEXT NOT NULL,
  outcome           JSONB,
  outcome_hash      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_ledger_tenant ON agent_actions_ledger (tenant_id, action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_ledger_ref ON agent_actions_ledger (reference_table, reference_id);

CREATE TABLE IF NOT EXISTS agent_approval_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_type         TEXT NOT NULL, -- discount | legal_notice | installment_plan | escalation | message_review
  reference_table   TEXT,
  reference_id      UUID,
  requested_by      TEXT NOT NULL DEFAULT 'yamen',
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | edited
  payload           JSONB NOT NULL DEFAULT '{}',
  finance_officer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_approval_queue_tenant ON agent_approval_queue (tenant_id, status, created_at DESC);

-- ============================================================================
-- 7. Staff↔staff and staff↔parent messaging
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_threads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL, -- staff_internal | staff_parent | collection_case
  subject               TEXT,
  linked_student_id     UUID REFERENCES students(id) ON DELETE SET NULL,
  linked_invoice_id     UUID REFERENCES invoices(id) ON DELETE SET NULL,
  linked_collection_case_id UUID, -- collection_profile id
  linked_profile_id     UUID REFERENCES collection_profiles(id) ON DELETE SET NULL,
  is_read               BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_threads_tenant ON message_threads (tenant_id, type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_threads_linked ON message_threads (linked_profile_id, linked_invoice_id, linked_student_id);

CREATE TABLE IF NOT EXISTS thread_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id         UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  participant_type  TEXT NOT NULL, -- user | guardian
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  guardian_id       UUID REFERENCES guardians(id) ON DELETE CASCADE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_participants_unique
  ON thread_participants (tenant_id, thread_id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(guardian_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS idx_thread_participants_thread ON thread_participants (thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_user ON thread_participants (participant_type, user_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_guardian ON thread_participants (participant_type, guardian_id);

CREATE TABLE IF NOT EXISTS thread_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id         UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_type       TEXT NOT NULL, -- staff | guardian | yamen | system
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  guardian_id       UUID REFERENCES guardians(id) ON DELETE SET NULL,
  body_ar           TEXT,
  body_en           TEXT,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  reply_to_message_id UUID REFERENCES thread_messages(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_messages_unread ON thread_messages (tenant_id, is_read, created_at DESC);

-- ============================================================================
-- 8. Collection-rate guarantee engine
-- ============================================================================
CREATE TABLE IF NOT EXISTS guarantee_baselines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  term              TEXT NOT NULL,
  formula_version     TEXT NOT NULL DEFAULT 'v1',
  net_invoiced      NUMERIC(15,2) NOT NULL,
  collected_within_window NUMERIC(15,2) NOT NULL,
  collection_rate   NUMERIC(6,5) NOT NULL,
  inputs_snapshot   JSONB NOT NULL DEFAULT '{}',
  inputs_hash       TEXT NOT NULL,
  certified_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  certified_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, term, formula_version)
);

CREATE INDEX IF NOT EXISTS idx_guarantee_baselines_tenant ON guarantee_baselines (tenant_id, term);

CREATE TABLE IF NOT EXISTS guarantee_measurements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  term              TEXT NOT NULL,
  version           INT NOT NULL DEFAULT 1,
  net_invoiced      NUMERIC(15,2) NOT NULL,
  collected         NUMERIC(15,2) NOT NULL,
  exclusions        NUMERIC(15,2) NOT NULL DEFAULT 0,
  collection_rate   NUMERIC(6,5) NOT NULL,
  delta_vs_baseline NUMERIC(6,5),
  inputs_snapshot   JSONB NOT NULL DEFAULT '{}',
  snapshot_hash     TEXT NOT NULL,
  formula_version   TEXT NOT NULL DEFAULT 'v1',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, term, version)
);

CREATE INDEX IF NOT EXISTS idx_guarantee_measurements_tenant ON guarantee_measurements (tenant_id, term, version);

CREATE TABLE IF NOT EXISTS guarantee_exclusions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  measurement_id      UUID NOT NULL REFERENCES guarantee_measurements(id) ON DELETE CASCADE,
  amount              NUMERIC(15,2) NOT NULL,
  reason              TEXT NOT NULL,
  evidence_url        TEXT,
  school_sign_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  school_signed_at    TIMESTAMPTZ,
  edusaga_sign_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  edusaga_signed_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guarantee_exclusions_measurement ON guarantee_exclusions (measurement_id);

-- ============================================================================
-- 9. Bank-transfer import review queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS collection_bank_transfer_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name         TEXT NOT NULL,
  raw_csv           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | matched | reviewed | applied
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_bank_transfer_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_id         UUID NOT NULL REFERENCES collection_bank_transfer_imports(id) ON DELETE CASCADE,
  amount            NUMERIC(15,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'SAR',
  reference         TEXT,
  sender_name       TEXT,
  bank_date         DATE,
  matched_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  matched_guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  match_confidence  NUMERIC(4,3),
  status            TEXT NOT NULL DEFAULT 'unmatched', -- unmatched | matched | approved | rejected
  reviewed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_items_import ON collection_bank_transfer_items (import_id);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_items_status ON collection_bank_transfer_items (tenant_id, status);

-- ============================================================================
-- 10. RLS policies (matches existing migration convention)
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'collection_settings','collection_profiles','collection_segments',
    'collection_sequences','collection_messages','collection_message_replies',
    'installment_plan_offers','agent_actions_ledger','agent_approval_queue',
    'message_threads','thread_participants','thread_messages',
    'guarantee_baselines','guarantee_measurements','guarantee_exclusions',
    'collection_bank_transfer_imports','collection_bank_transfer_items'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_%s ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid) WITH CHECK (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 11. Append-only triggers for immutable ledgers / baselines / measurements
-- ============================================================================
CREATE OR REPLACE FUNCTION immutable_table_protector()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; UPDATE and DELETE are not permitted', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  immutable_tables TEXT[] := ARRAY[
    'agent_actions_ledger',
    'guarantee_baselines',
    'guarantee_measurements'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY immutable_tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I_immutable ON %I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION immutable_table_protector()',
      tbl, tbl
    );
  END LOOP;
END $$;
