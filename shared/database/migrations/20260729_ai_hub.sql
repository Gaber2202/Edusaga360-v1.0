-- ============================================================================
-- 20260729_ai_hub.sql
-- Support Infobip AI Hub / Conversations inbound messages for the parent AI
-- assistant. Reuses message_threads/thread_messages and adds AI-specific state.
-- ============================================================================

-- Link an AI thread directly to a guardian for fast lookups.
ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS linked_guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;

COMMENT ON COLUMN message_threads.type IS 'staff_internal | staff_parent | collection_case | ai_parent';
COMMENT ON COLUMN message_threads.status IS 'open | handoff | closed | resolved';
COMMENT ON COLUMN thread_messages.sender_type IS 'staff | guardian | yamen | system | ai';

CREATE INDEX IF NOT EXISTS idx_message_threads_ai_parent
  ON message_threads (tenant_id, type, linked_guardian_id, status);

CREATE INDEX IF NOT EXISTS idx_message_threads_handoff
  ON message_threads (tenant_id, type, status, updated_at DESC)
  WHERE type = 'ai_parent' AND status = 'handoff';
