-- Infobip delivery-receipt tracking.
-- Adds provider_message_id to collection_messages and a generic event log.

ALTER TABLE collection_messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_collection_messages_provider_message_id
  ON collection_messages (provider_message_id);

CREATE TABLE IF NOT EXISTS message_delivery_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL, -- infobip
  channel               TEXT NOT NULL, -- whatsapp | sms | email | etc.
  provider_message_id   TEXT NOT NULL,
  event_status          TEXT NOT NULL,
  event_payload         JSONB NOT NULL DEFAULT '{}',
  collection_message_id UUID REFERENCES collection_messages(id) ON DELETE SET NULL,
  thread_message_id     UUID, -- reserved for future chat-thread events
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_delivery_events_provider_message
  ON message_delivery_events (provider, provider_message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_delivery_events_collection_message
  ON message_delivery_events (collection_message_id, created_at DESC);
