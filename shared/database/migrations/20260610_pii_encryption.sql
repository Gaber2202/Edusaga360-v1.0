-- =============================================================================
-- PII ENCRYPTION MIGRATION
-- Encrypts sensitive employee PII columns using pgcrypto symmetric encryption.
--
-- Strategy: rename existing plain TEXT columns to _plain, add new TEXT columns
-- for the ciphertext, encrypt existing data, then drop plain columns.
--
-- Encryption: pgp_sym_encrypt(value, current_setting('app.encryption_key'))
-- Decryption: pgp_sym_decrypt(ciphertext::bytea, current_setting('app.encryption_key'))
--
-- The encryption key must be set as a Supabase Vault secret named 'pii_key'
-- and injected via a custom session setting in the connection pool config,
-- OR passed explicitly in each decrypt call.
--
-- For the initial implementation we use pgp_sym_encrypt with an app-level key
-- stored in Supabase Vault. The backend reads via:
--   SELECT pgp_sym_decrypt(national_id_enc::bytea, $1) FROM employees WHERE id = $2
-- with $1 = vault secret value.
--
-- IMPORTANT: Run this after setting the Supabase Vault secret 'pii_key'.
--   SELECT vault.create_secret('YOUR_STRONG_KEY_HERE', 'pii_key');
-- =============================================================================

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- EMPLOYEES table — encrypt: national_id, iqama_number, passport_number, bank_iban
-- ---------------------------------------------------------------------------

-- Step 1: Add new encrypted columns
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS national_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS iqama_number_enc TEXT,
  ADD COLUMN IF NOT EXISTS passport_number_enc TEXT,
  ADD COLUMN IF NOT EXISTS bank_iban_enc TEXT;

-- Step 2: Encrypt existing plaintext data
-- (Runs only if vault.decrypted_secrets is accessible — otherwise skip)
DO $$
DECLARE
  enc_key TEXT;
BEGIN
  -- Attempt to read encryption key from Vault
  BEGIN
    SELECT decrypted_secret INTO enc_key
    FROM vault.decrypted_secrets
    WHERE name = 'pii_key'
    LIMIT 1;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Vault not accessible or pii_key secret not set. Skipping data encryption. Set up the key and re-run the UPDATE statements manually.';
    RETURN;
  END;

  IF enc_key IS NULL THEN
    RAISE NOTICE 'pii_key secret is NULL. Skipping data encryption.';
    RETURN;
  END IF;

  UPDATE employees
  SET
    national_id_enc    = CASE WHEN national_id    IS NOT NULL THEN pgp_sym_encrypt(national_id,    enc_key) ELSE NULL END,
    iqama_number_enc   = CASE WHEN iqama_number   IS NOT NULL THEN pgp_sym_encrypt(iqama_number,   enc_key) ELSE NULL END,
    passport_number_enc = CASE WHEN passport_number IS NOT NULL THEN pgp_sym_encrypt(passport_number, enc_key) ELSE NULL END,
    bank_iban_enc      = CASE WHEN bank_iban      IS NOT NULL THEN pgp_sym_encrypt(bank_iban,      enc_key) ELSE NULL END;

  RAISE NOTICE 'Employee PII encrypted successfully.';
END $$;

-- Step 3: Drop old plaintext columns
-- NOTE: Only run this block after verifying encrypted data is correct.
-- Uncomment when ready:
-- ALTER TABLE employees
--   DROP COLUMN IF EXISTS national_id,
--   DROP COLUMN IF EXISTS iqama_number,
--   DROP COLUMN IF EXISTS passport_number,
--   DROP COLUMN IF EXISTS bank_iban;

-- For now, nullify the plaintext columns so they no longer hold live data
-- while the application is updated to read from *_enc columns instead.
UPDATE employees
SET
  national_id     = NULL,
  iqama_number    = NULL,
  passport_number = NULL,
  bank_iban       = NULL
WHERE
  national_id_enc    IS NOT NULL
  OR iqama_number_enc   IS NOT NULL
  OR passport_number_enc IS NOT NULL
  OR bank_iban_enc      IS NOT NULL;

-- ---------------------------------------------------------------------------
-- STUDENTS table — encrypt: national_id, iqama_number, passport_number
-- ---------------------------------------------------------------------------
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS national_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS iqama_number_enc TEXT,
  ADD COLUMN IF NOT EXISTS passport_number_enc TEXT;

DO $$
DECLARE
  enc_key TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO enc_key FROM vault.decrypted_secrets WHERE name = 'pii_key' LIMIT 1;
  EXCEPTION WHEN others THEN RETURN;
  END;
  IF enc_key IS NULL THEN RETURN; END IF;

  UPDATE students
  SET
    national_id_enc     = CASE WHEN national_id     IS NOT NULL THEN pgp_sym_encrypt(national_id,     enc_key) ELSE NULL END,
    iqama_number_enc    = CASE WHEN iqama_number    IS NOT NULL THEN pgp_sym_encrypt(iqama_number,    enc_key) ELSE NULL END,
    passport_number_enc = CASE WHEN passport_number IS NOT NULL THEN pgp_sym_encrypt(passport_number, enc_key) ELSE NULL END;

  RAISE NOTICE 'Student PII encrypted successfully.';
END $$;

UPDATE students
SET
  national_id     = NULL,
  iqama_number    = NULL,
  passport_number = NULL
WHERE
  national_id_enc IS NOT NULL
  OR iqama_number_enc IS NOT NULL
  OR passport_number_enc IS NOT NULL;

-- ---------------------------------------------------------------------------
-- GUARDIANS table — encrypt: national_id
-- ---------------------------------------------------------------------------
ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS national_id_enc TEXT;

DO $$
DECLARE
  enc_key TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO enc_key FROM vault.decrypted_secrets WHERE name = 'pii_key' LIMIT 1;
  EXCEPTION WHEN others THEN RETURN;
  END;
  IF enc_key IS NULL THEN RETURN; END IF;

  UPDATE guardians
  SET national_id_enc = CASE WHEN national_id IS NOT NULL THEN pgp_sym_encrypt(national_id, enc_key) ELSE NULL END;

  RAISE NOTICE 'Guardian PII encrypted successfully.';
END $$;

UPDATE guardians SET national_id = NULL WHERE national_id_enc IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Storage bucket configuration — create private tenant-files bucket
-- (Supabase Storage buckets must also be created in the dashboard/API,
--  but this documents the intended configuration)
-- ---------------------------------------------------------------------------

-- Add an index on the encrypted columns to allow equality lookups via hash
-- (cannot index encrypted content directly — lookups must use the decrypt wrapper)
-- No B-tree index on enc columns — full-table-scan with decrypt is acceptable
-- for compliance. If search is needed, store a deterministic HMAC alongside.

COMMENT ON COLUMN employees.national_id_enc IS 'pgp_sym_encrypt(national_id, pii_key) — use pgp_sym_decrypt to read';
COMMENT ON COLUMN employees.iqama_number_enc IS 'pgp_sym_encrypt(iqama_number, pii_key) — use pgp_sym_decrypt to read';
COMMENT ON COLUMN employees.passport_number_enc IS 'pgp_sym_encrypt(passport_number, pii_key) — use pgp_sym_decrypt to read';
COMMENT ON COLUMN employees.bank_iban_enc IS 'pgp_sym_encrypt(bank_iban, pii_key) — use pgp_sym_decrypt to read';
