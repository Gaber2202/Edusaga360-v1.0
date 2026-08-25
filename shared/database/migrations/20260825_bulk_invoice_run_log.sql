-- SCRUM-128: persist per-student failure isolation / run log on bulk batches
ALTER TABLE invoice_batches
  ADD COLUMN IF NOT EXISTS run_log JSONB DEFAULT '[]'::jsonb;
