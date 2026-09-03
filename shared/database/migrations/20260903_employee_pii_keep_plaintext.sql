-- Keep employee PII readable in the HR UI after save, and never block writes.
--
-- Live DB has encrypt_employee_pii() as a BEFORE INSERT/UPDATE trigger.
-- The previous version NULLed plaintext national_id / bank_iban after copying
-- them into *_enc, so the Employees form always looked unsaved.
--
-- pgcrypto lives in the `extensions` schema on hosted Supabase.

CREATE OR REPLACE FUNCTION public.encrypt_employee_pii()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO enc_key
    FROM vault.decrypted_secrets
    WHERE name = 'pii_key'
    LIMIT 1;
  EXCEPTION WHEN others THEN
    enc_key := NULL;
  END;

  IF enc_key IS NOT NULL THEN
    BEGIN
      IF NEW.national_id IS NOT NULL THEN
        NEW.national_id_enc := pgp_sym_encrypt(NEW.national_id, enc_key);
      END IF;
      IF NEW.iqama_number IS NOT NULL THEN
        NEW.iqama_number_enc := pgp_sym_encrypt(NEW.iqama_number, enc_key);
      END IF;
      IF NEW.passport_number IS NOT NULL THEN
        NEW.passport_number_enc := pgp_sym_encrypt(NEW.passport_number, enc_key);
      END IF;
      IF NEW.bank_iban IS NOT NULL THEN
        NEW.bank_iban_enc := pgp_sym_encrypt(NEW.bank_iban, enc_key);
      END IF;
    EXCEPTION WHEN others THEN
      -- Encryption is best-effort; never block HR profile saves.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_employee_pii() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encrypt_employee_pii() FROM anon;
REVOKE ALL ON FUNCTION public.encrypt_employee_pii() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_employee_pii() TO service_role;
