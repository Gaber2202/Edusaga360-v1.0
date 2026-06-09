-- Extend students table with additional fields for enhanced student profile
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS iqama_number TEXT,
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS blood_type TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT,
  ADD COLUMN IF NOT EXISTS chronic_conditions TEXT,
  ADD COLUMN IF NOT EXISTS medications TEXT,
  ADD COLUMN IF NOT EXISTS guardian_occupation TEXT,
  ADD COLUMN IF NOT EXISTS guardian2_name_ar TEXT,
  ADD COLUMN IF NOT EXISTS guardian2_name_en TEXT,
  ADD COLUMN IF NOT EXISTS guardian2_phone TEXT,
  ADD COLUMN IF NOT EXISTS guardian2_relationship TEXT,
  ADD COLUMN IF NOT EXISTS guardian2_national_id TEXT,
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT,
  ADD COLUMN IF NOT EXISTS doc_birth_cert_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_student_id_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_guardian_id_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_transfer_url TEXT,
  ADD COLUMN IF NOT EXISTS doc_other_url TEXT;

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_students_fee_structure ON public.students(fee_structure_id) WHERE fee_structure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_payment_plan ON public.students(payment_plan_id) WHERE payment_plan_id IS NOT NULL;
