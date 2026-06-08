-- Migration: Parent Portal user linking
-- Adds user_role and linked_student_ids columns to users table for parent portal access

-- Add user_role column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_role'
  ) THEN
    ALTER TABLE users ADD COLUMN user_role TEXT;
  END IF;
END $$;

-- Add linked_student_ids column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'linked_student_ids'
  ) THEN
    ALTER TABLE users ADD COLUMN linked_student_ids UUID[] DEFAULT '{}';
  END IF;
END $$;

-- Add auth_id column to guardians for linking to Supabase Auth (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guardians' AND column_name = 'auth_id'
  ) THEN
    ALTER TABLE guardians ADD COLUMN auth_id UUID;
  END IF;
END $$;

-- Create index for fast parent lookup by email + tenant
CREATE INDEX IF NOT EXISTS idx_users_email_tenant_role ON users(email, tenant_id, user_role);
CREATE INDEX IF NOT EXISTS idx_guardians_email_tenant ON guardians(email, tenant_id);

-- Add platform_owner_access RLS policy to guardians if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'guardians' AND policyname = 'platform_owner_access'
  ) THEN
    CREATE POLICY platform_owner_access ON public.guardians FOR ALL USING (
      (auth.jwt() -> 'app_metadata' ->> 'is_platform_owner')::boolean = true
    );
  END IF;
END $$;
