-- MFA / OTP infrastructure for 2FA and PIN codes via SMS/WhatsApp/Email.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mfa_required     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_channel      TEXT,
  ADD COLUMN IF NOT EXISTS mfa_destination  TEXT;

CREATE TABLE IF NOT EXISTS otp_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose         TEXT NOT NULL, -- mfa_login | mfa_enroll | pin_action
  channel         TEXT NOT NULL, -- sms | whatsapp | email
  destination     TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  expires_at      TIMESTAMPTZ NOT NULL,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  invalidated     BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_status TEXT DEFAULT 'pending',
  delivery_attempts JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_purpose
  ON otp_codes (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_codes_expires
  ON otp_codes (expires_at);
