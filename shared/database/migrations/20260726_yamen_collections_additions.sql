-- ============================================================================
-- 20260726_yamen_collections_additions.sql
--
-- Follow-up columns for collection_messages needed by the public Moyasar
-- reconciliation webhook and messaging engine.
-- ============================================================================

ALTER TABLE collection_messages
  ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stop_reason TEXT,
  ADD COLUMN IF NOT EXISTS moyasar_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'yamen'; -- yamen | manual | staff

CREATE INDEX IF NOT EXISTS idx_collection_messages_payment ON collection_messages (tenant_id, moyasar_payment_id);
