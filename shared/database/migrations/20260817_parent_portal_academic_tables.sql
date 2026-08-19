-- Parent portal academic + messaging tables
-- Makes Progress, Attendance, Homework, Announcements, and Messages
-- queryable by the parent-portal app. Idempotent.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Display fields the parent portal and student forms already read.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS student_number TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT;

-- Grades / assessments shown on Student Progress
CREATE TABLE IF NOT EXISTS public.student_grades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL,
  subject_ar        TEXT,
  assessment_name   TEXT,
  assessment_name_ar TEXT,
  score             NUMERIC(6,2),
  max_score         NUMERIC(6,2) DEFAULT 100,
  letter_grade      TEXT,
  term              TEXT,
  teacher_name      TEXT,
  teacher_notes     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_grades_student
  ON public.student_grades (tenant_id, student_id, created_at DESC);

-- Homework shown on the Homework page
CREATE TABLE IF NOT EXISTS public.homework_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES public.students(id) ON DELETE CASCADE,
  grade           TEXT,
  subject         TEXT NOT NULL,
  subject_ar      TEXT,
  title_en        TEXT NOT NULL,
  title_ar        TEXT,
  description_en  TEXT,
  description_ar  TEXT,
  due_date        DATE,
  status          TEXT NOT NULL DEFAULT 'assigned',
  teacher_name    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homework_assignments_student
  ON public.homework_assignments (tenant_id, student_id, due_date DESC);

-- Parent ↔ school messages (used by AdminMessaging and the parent portal)
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES public.students(id) ON DELETE SET NULL,
  from_user_email TEXT,
  from_user_name  TEXT,
  from_user_role  TEXT,
  to_user_email   TEXT,
  to_user_name    TEXT,
  subject         TEXT NOT NULL,
  content         TEXT,
  message_type    TEXT DEFAULT 'general',
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_student
  ON public.messages (tenant_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_to_email
  ON public.messages (tenant_id, to_user_email, created_at DESC);

ALTER TABLE public.student_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.student_grades;
DROP POLICY IF EXISTS "platform_owner_access" ON public.student_grades;
CREATE POLICY "tenant_isolation" ON public.student_grades
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));
CREATE POLICY "platform_owner_access" ON public.student_grades
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

DROP POLICY IF EXISTS "tenant_isolation" ON public.homework_assignments;
DROP POLICY IF EXISTS "platform_owner_access" ON public.homework_assignments;
CREATE POLICY "tenant_isolation" ON public.homework_assignments
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));
CREATE POLICY "platform_owner_access" ON public.homework_assignments
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

DROP POLICY IF EXISTS "tenant_isolation" ON public.messages;
DROP POLICY IF EXISTS "platform_owner_access" ON public.messages;
CREATE POLICY "tenant_isolation" ON public.messages
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));
CREATE POLICY "platform_owner_access" ON public.messages
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
