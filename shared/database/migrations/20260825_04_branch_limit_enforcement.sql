-- Phase 3 P3-1: server-side branch count enforcement against tenant subscription.
-- Frontend-only limits are not limits — this trigger blocks direct Supabase inserts too.

CREATE OR REPLACE FUNCTION enforce_tenant_branch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max   INTEGER;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(max_branches, 9999) INTO v_max
  FROM tenants
  WHERE id = NEW.tenant_id;

  IF v_max IS NULL THEN
    v_max := 9999;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM branches
  WHERE tenant_id = NEW.tenant_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'branch_limit_exceeded: tenant % has % branches (max %)',
      NEW.tenant_id, v_count, v_max
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_limit_before_insert ON branches;

CREATE TRIGGER trg_branches_limit_before_insert
  BEFORE INSERT ON branches
  FOR EACH ROW
  EXECUTE FUNCTION enforce_tenant_branch_limit();
