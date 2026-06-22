-- HR Module Jisr-Style Enhancements — Additive Only
-- Adds tables for: recruitment interviews, career postings, corporate cards,
-- card transactions, travel requests, travel policies, announcements,
-- employee surveys, survey responses, learning paths, 360 feedback

-- Recruitment: Interview Scheduling
CREATE TABLE IF NOT EXISTS recruitment_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  applicant_id UUID,
  applicant_name TEXT,
  recruitment_id UUID,
  interview_date DATE,
  interview_time TEXT,
  platform TEXT DEFAULT 'google_meet',
  meeting_link TEXT,
  interviewer_name TEXT,
  interviewer_email TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  feedback TEXT,
  score NUMERIC,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Recruitment: Career Postings (branded portal)
CREATE TABLE IF NOT EXISTS career_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  recruitment_id UUID,
  title_ar TEXT,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  requirements TEXT,
  employment_type TEXT,
  department_id UUID,
  branch_id UUID,
  salary_range_min NUMERIC,
  salary_range_max NUMERIC,
  is_published BOOLEAN DEFAULT false,
  published_date TIMESTAMPTZ,
  application_deadline TIMESTAMPTZ,
  application_form_config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Corporate Cards
CREATE TABLE IF NOT EXISTS corporate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  card_code TEXT,
  card_type TEXT DEFAULT 'virtual',
  card_number TEXT,
  cardholder_name TEXT,
  employee_id UUID,
  spend_limit NUMERIC DEFAULT 5000,
  currency TEXT DEFAULT 'SAR',
  vendor_restrictions TEXT,
  category_restrictions TEXT,
  issued_date DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'active',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Card Transactions
CREATE TABLE IF NOT EXISTS card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  card_id UUID REFERENCES corporate_cards(id),
  cardholder_name TEXT,
  transaction_date TIMESTAMPTZ,
  merchant TEXT,
  category TEXT,
  amount NUMERIC,
  currency TEXT DEFAULT 'SAR',
  receipt_url TEXT,
  status TEXT DEFAULT 'completed',
  reconciled BOOLEAN DEFAULT false,
  flagged BOOLEAN DEFAULT false,
  gl_entry_id UUID,
  notes TEXT,
  created_date TIMESTAMPTZ DEFAULT now()
);

-- Business Travel Requests
CREATE TABLE IF NOT EXISTS travel_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  request_number TEXT,
  employee_name TEXT,
  requested_by TEXT,
  department_id UUID,
  branch_id UUID,
  destination TEXT,
  purpose TEXT,
  departure_date DATE,
  return_date DATE,
  transportation_type TEXT DEFAULT 'flight',
  accommodation_type TEXT DEFAULT 'hotel',
  estimated_cost NUMERIC DEFAULT 0,
  actual_cost NUMERIC,
  per_diem NUMERIC DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_date DATE,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Travel Policies
CREATE TABLE IF NOT EXISTS travel_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role_name TEXT,
  department_name TEXT,
  daily_limit NUMERIC,
  flight_class TEXT DEFAULT 'Economy',
  hotel_category TEXT DEFAULT '3-star',
  per_diem_rate NUMERIC,
  requires_approval BOOLEAN DEFAULT true,
  created_date TIMESTAMPTZ DEFAULT now()
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  announcement_number TEXT,
  title_ar TEXT,
  title_en TEXT,
  body_ar TEXT,
  body_en TEXT,
  audience TEXT DEFAULT 'all',
  priority TEXT DEFAULT 'normal',
  scheduled_date TIMESTAMPTZ,
  allow_comments BOOLEAN DEFAULT true,
  allow_reactions BOOLEAN DEFAULT true,
  reactions JSONB DEFAULT '{"likes": 0, "hearts": 0}',
  comments_count INT DEFAULT 0,
  attachments JSONB DEFAULT '[]',
  created_by TEXT,
  status TEXT DEFAULT 'published',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Employee Surveys
CREATE TABLE IF NOT EXISTS employee_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  survey_code TEXT,
  title_ar TEXT,
  title_en TEXT,
  description TEXT,
  survey_type TEXT DEFAULT 'general',
  is_anonymous BOOLEAN DEFAULT true,
  deadline DATE,
  questions JSONB DEFAULT '[]',
  created_by TEXT,
  responses_count INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Survey Responses
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  survey_id UUID REFERENCES employee_surveys(id),
  respondent_id UUID,
  respondent_email TEXT,
  survey_type TEXT,
  answers JSONB DEFAULT '{}',
  score NUMERIC,
  submitted_date TIMESTAMPTZ DEFAULT now()
);

-- Learning Paths
CREATE TABLE IF NOT EXISTS learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  path_name_ar TEXT,
  path_name_en TEXT,
  description TEXT,
  target_role TEXT,
  modules JSONB DEFAULT '[]',
  total_hours NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_by TEXT,
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- 360-Degree Feedback
CREATE TABLE IF NOT EXISTS feedback_360 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  evaluation_id UUID,
  employee_id UUID,
  reviewer_id UUID,
  reviewer_name TEXT,
  review_type TEXT DEFAULT 'peer',
  kpi_scores JSONB DEFAULT '[]',
  total_score NUMERIC,
  strengths TEXT,
  areas_for_improvement TEXT,
  comments TEXT,
  status TEXT DEFAULT 'pending',
  submitted_date TIMESTAMPTZ,
  created_date TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (enable row-level security)
ALTER TABLE recruitment_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_360 ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'recruitment_interviews', 'recruitment_interviews');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'career_postings', 'career_postings');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'corporate_cards', 'corporate_cards');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'card_transactions', 'card_transactions');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'travel_requests', 'travel_requests');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'travel_policies', 'travel_policies');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'announcements', 'announcements');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'employee_surveys', 'employee_surveys');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'survey_responses', 'survey_responses');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'learning_paths', 'learning_paths');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenant_isolation_%s ON %I FOR ALL TO authenticated USING (tenant_id = ((current_setting(''request.jwt.claims'', true)::json)->>''tenant_id'')::uuid)', 'feedback_360', 'feedback_360');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
