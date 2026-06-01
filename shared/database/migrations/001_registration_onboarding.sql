-- Migration: Add onboarding fields to registration_requests and tenants
-- Run in Supabase SQL Editor

-- Add onboarding columns to registration_requests
ALTER TABLE registration_requests
  ADD COLUMN IF NOT EXISTS onboarding_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS denied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

-- Make contact_phone and school_name_en nullable for flexibility
ALTER TABLE registration_requests
  ALTER COLUMN contact_phone DROP NOT NULL,
  ALTER COLUMN school_name_en DROP NOT NULL;

-- Add additional tenant columns for onboarding
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_code TEXT,
  ADD COLUMN IF NOT EXISTS admin_email TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS school_type TEXT,
  ADD COLUMN IF NOT EXISTS trial_end_date DATE,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS academic_year_start DATE,
  ADD COLUMN IF NOT EXISTS num_grades INTEGER,
  ADD COLUMN IF NOT EXISTS default_language TEXT DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS max_students INTEGER,
  ADD COLUMN IF NOT EXISTS max_employees INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS current_students INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_employees INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[],
  ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

-- Allow pending_approval and denied as tenant statuses
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'trial', 'pending_approval', 'denied'));

-- Allow more registration request statuses
UPDATE registration_requests SET status = 'pending' WHERE status IS NULL;
