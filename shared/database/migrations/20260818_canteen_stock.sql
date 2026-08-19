-- Canteen inventory: per-item stock and an append-only movement log.
-- Idempotent.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE public.canteen_menu_items
  ADD COLUMN IF NOT EXISTS stock_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.canteen_menu_items
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canteen_menu_items_stock_qty_check'
      AND conrelid = 'public.canteen_menu_items'::regclass
  ) THEN
    ALTER TABLE public.canteen_menu_items
      ADD CONSTRAINT canteen_menu_items_stock_qty_check CHECK (stock_qty >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.canteen_stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES public.canteen_menu_items(id) ON DELETE SET NULL,
  item_name       TEXT NOT NULL,
  movement_type   TEXT NOT NULL
                  CHECK (movement_type IN ('opening', 'receive', 'sale', 'waste', 'adjustment')),
  qty_delta       INTEGER NOT NULL CHECK (qty_delta <> 0),
  qty_before      INTEGER NOT NULL,
  qty_after       INTEGER NOT NULL,
  reason          TEXT,
  performed_by    TEXT,
  sale_txn_id     UUID REFERENCES public.canteen_transactions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canteen_stock_movements_tenant
  ON public.canteen_stock_movements (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canteen_stock_movements_item
  ON public.canteen_stock_movements (tenant_id, item_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.canteen_apply_stock(
  p_tenant_id UUID,
  p_item_id UUID,
  p_movement_type TEXT,
  p_qty_delta INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_performed_by TEXT DEFAULT NULL,
  p_sale_txn_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INTEGER;
  v_after INTEGER;
  v_name TEXT;
  v_id UUID;
  v_role TEXT;
BEGIN
  v_role := coalesce(auth.role(), '');
  IF v_role <> 'service_role'
     AND NOT coalesce(public.auth_is_platform_owner(), false)
     AND public.auth_tenant_id() IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'item_required';
  END IF;

  IF p_qty_delta IS NULL OR p_qty_delta = 0 THEN
    RAISE EXCEPTION 'invalid_qty';
  END IF;

  IF p_movement_type NOT IN ('opening', 'receive', 'sale', 'waste', 'adjustment') THEN
    RAISE EXCEPTION 'invalid_movement_type';
  END IF;

  IF p_movement_type IN ('opening', 'receive') AND p_qty_delta < 0 THEN
    RAISE EXCEPTION 'invalid_qty';
  END IF;

  IF p_movement_type IN ('sale', 'waste') AND p_qty_delta > 0 THEN
    RAISE EXCEPTION 'invalid_qty';
  END IF;

  SELECT stock_qty, coalesce(nullif(name_ar, ''), name_en)
  INTO v_before, v_name
  FROM canteen_menu_items
  WHERE id = p_item_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  v_after := v_before + p_qty_delta;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  UPDATE canteen_menu_items
  SET stock_qty = v_after,
      updated_at = NOW()
  WHERE id = p_item_id AND tenant_id = p_tenant_id;

  INSERT INTO canteen_stock_movements (
    tenant_id, item_id, item_name, movement_type,
    qty_delta, qty_before, qty_after, reason, performed_by, sale_txn_id
  ) VALUES (
    p_tenant_id, p_item_id, v_name, p_movement_type,
    p_qty_delta, v_before, v_after, p_reason, p_performed_by, p_sale_txn_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

ALTER TABLE public.canteen_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.canteen_stock_movements;
DROP POLICY IF EXISTS platform_owner_access ON public.canteen_stock_movements;

CREATE POLICY tenant_isolation ON public.canteen_stock_movements
  FOR ALL TO authenticated
  USING (tenant_id = (select public.auth_tenant_id()))
  WITH CHECK (tenant_id = (select public.auth_tenant_id()));

CREATE POLICY platform_owner_access ON public.canteen_stock_movements
  FOR ALL TO authenticated
  USING ((select public.auth_is_platform_owner()))
  WITH CHECK ((select public.auth_is_platform_owner()));

GRANT SELECT, INSERT ON public.canteen_stock_movements TO authenticated;
GRANT ALL ON public.canteen_stock_movements TO service_role;
GRANT EXECUTE ON FUNCTION public.canteen_apply_stock TO authenticated, service_role;
