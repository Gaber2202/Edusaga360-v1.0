-- Parent-declared canteen allergen types on students (POS safety alerts).
-- Idempotent.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS canteen_allergens TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.students.canteen_allergens IS
  'Parent-set canteen allergen keys: nuts, dairy, gluten, eggs, soy, fish, shellfish';
