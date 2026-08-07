-- Task 13b: add is_saudi to students and applicants so the frontend can
-- display nationality classification computed by the backend instead of
-- re-computing it in React.
--
-- Rollback (run manually if needed):
--   DROP TRIGGER IF EXISTS set_is_saudi ON students;
--   DROP FUNCTION IF EXISTS trg_students_set_is_saudi();
--   ALTER TABLE students DROP COLUMN IF EXISTS is_saudi;
--   DROP TRIGGER IF EXISTS set_is_saudi ON applicants;
--   DROP FUNCTION IF EXISTS trg_applicants_set_is_saudi();
--   DROP FUNCTION IF EXISTS is_saudi_nationality(text);
--   ALTER TABLE applicants DROP COLUMN IF EXISTS is_saudi;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION is_saudi_nationality(nationality text)
RETURNS boolean AS $$
BEGIN
  RETURN LOWER(TRIM(COALESCE(nationality, ''))) IN ('saudi', 'saudi arabia', 'sa')
    OR TRIM(COALESCE(nationality, '')) = 'سعودي';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Students
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_saudi BOOLEAN;

CREATE OR REPLACE FUNCTION trg_students_set_is_saudi()
RETURNS trigger AS $$
BEGIN
  NEW.is_saudi := is_saudi_nationality(NEW.nationality);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_is_saudi ON students;
CREATE TRIGGER set_is_saudi
  BEFORE INSERT OR UPDATE OF nationality ON students
  FOR EACH ROW
  EXECUTE FUNCTION trg_students_set_is_saudi();

-- Applicants
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS is_saudi BOOLEAN;

CREATE OR REPLACE FUNCTION trg_applicants_set_is_saudi()
RETURNS trigger AS $$
BEGIN
  NEW.is_saudi := is_saudi_nationality(NEW.nationality);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_is_saudi ON applicants;
CREATE TRIGGER set_is_saudi
  BEFORE INSERT OR UPDATE OF nationality ON applicants
  FOR EACH ROW
  EXECUTE FUNCTION trg_applicants_set_is_saudi();
