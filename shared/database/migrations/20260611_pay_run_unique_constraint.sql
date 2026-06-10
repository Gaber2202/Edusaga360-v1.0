-- Prevent duplicate pay runs for the same period + branch
-- Wraps in DO block so it's safe if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pay_runs_unique_period_branch'
  ) THEN
    ALTER TABLE pay_runs
      ADD CONSTRAINT pay_runs_unique_period_branch
      UNIQUE (tenant_id, period, branch_id);
  END IF;
END $$;
