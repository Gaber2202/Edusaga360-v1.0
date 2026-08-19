-- Parent portal commerce: canteen wallets, school store, invoice source discriminator
-- Idempotent.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'tuition';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_invoices_source
  ON public.invoices (tenant_id, source, student_id);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS application_id UUID;

-- ── Canteen ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.canteen_wallets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name          TEXT,
  grade                 TEXT,
  balance               NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  daily_spend_limit     NUMERIC(12,2),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  last_transaction_date DATE,
  last_transaction_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.canteen_menu_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  category        TEXT NOT NULL DEFAULT 'other',
  price           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  calories        INTEGER,
  allergens       TEXT[] DEFAULT '{}',
  is_halal        BOOLEAN NOT NULL DEFAULT TRUE,
  is_prohibited   BOOLEAN NOT NULL DEFAULT FALSE,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.canteen_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_id           UUID REFERENCES public.canteen_wallets(id) ON DELETE SET NULL,
  student_id          UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name        TEXT,
  transaction_type    TEXT NOT NULL CHECK (transaction_type IN ('topup', 'purchase', 'refund', 'adjustment')),
  amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  balance_before      NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_after       NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method      TEXT,
  invoice_id          UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  items               JSONB DEFAULT '[]'::jsonb,
  notes               TEXT,
  transaction_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_time    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canteen_wallets_student
  ON public.canteen_wallets (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS idx_canteen_transactions_student
  ON public.canteen_transactions (tenant_id, student_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canteen_transactions_invoice_topup
  ON public.canteen_transactions (tenant_id, invoice_id)
  WHERE invoice_id IS NOT NULL AND transaction_type = 'topup';

-- ── School store ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku               TEXT,
  name_en           TEXT NOT NULL,
  name_ar           TEXT,
  description_en    TEXT,
  description_ar    TEXT,
  category          TEXT NOT NULL DEFAULT 'other'
                    CHECK (category IN ('uniform', 'pool', 'playground', 'other')),
  fulfillment_mode  TEXT NOT NULL DEFAULT 'purchase'
                    CHECK (fulfillment_mode IN ('purchase', 'rental', 'both')),
  tax_code          TEXT NOT NULL DEFAULT 'UNIFORM',
  price_purchase    NUMERIC(12,2),
  price_rental      NUMERIC(12,2),
  rental_unit       TEXT CHECK (rental_unit IN ('day', 'term', 'season', 'hour')),
  variants          JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock_qty         INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  collect_location  TEXT,
  image_url         TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_user_id  UUID,
  parent_email    TEXT,
  order_number    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending_payment'
                  CHECK (status IN ('pending_payment', 'paid', 'ready_for_collect', 'collected', 'cancelled', 'refunded')),
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code   TEXT NOT NULL DEFAULT 'SAR',
  collect_location TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  collected_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.store_order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES public.store_products(id) ON DELETE SET NULL,
  line_type       TEXT NOT NULL CHECK (line_type IN ('purchase', 'rental')),
  product_name_en TEXT NOT NULL,
  product_name_ar TEXT,
  variant_label   TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_code        TEXT NOT NULL DEFAULT 'UNIFORM',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_products_category
  ON public.store_products (tenant_id, category, is_active);

CREATE INDEX IF NOT EXISTS idx_store_orders_student
  ON public.store_orders (tenant_id, student_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_orders_invoice
  ON public.store_orders (tenant_id, invoice_id)
  WHERE invoice_id IS NOT NULL;

-- Atomic wallet balance updates (POS deduct + webhook credit)
CREATE OR REPLACE FUNCTION public.canteen_apply_txn(
  p_tenant_id UUID,
  p_student_id UUID,
  p_txn_type TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT NULL,
  p_invoice_id UUID DEFAULT NULL,
  p_student_name TEXT DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_balance_before NUMERIC(12,2);
  v_balance_after NUMERIC(12,2);
  v_txn_id UUID;
  v_today DATE := CURRENT_DATE;
  v_time TEXT := to_char(NOW(), 'HH24:MI');
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF p_txn_type NOT IN ('topup', 'purchase', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'invalid_txn_type';
  END IF;

  IF p_invoice_id IS NOT NULL AND p_txn_type = 'topup' THEN
    SELECT id INTO v_txn_id
    FROM canteen_transactions
    WHERE tenant_id = p_tenant_id
      AND invoice_id = p_invoice_id
      AND transaction_type = 'topup'
    LIMIT 1;
    IF v_txn_id IS NOT NULL THEN
      RETURN v_txn_id;
    END IF;
  END IF;

  SELECT id, balance
  INTO v_wallet_id, v_balance_before
  FROM canteen_wallets
  WHERE tenant_id = p_tenant_id AND student_id = p_student_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO canteen_wallets (
      tenant_id, student_id, student_name, grade, balance, is_active, last_transaction_date, last_transaction_at
    ) VALUES (
      p_tenant_id, p_student_id, p_student_name, p_grade, 0, TRUE, v_today, NOW()
    )
    RETURNING id, balance INTO v_wallet_id, v_balance_before;
  END IF;

  IF p_txn_type IN ('purchase', 'adjustment') THEN
    v_balance_after := v_balance_before - p_amount;
    IF v_balance_after < 0 THEN
      RAISE EXCEPTION 'insufficient_balance';
    END IF;
  ELSE
    v_balance_after := v_balance_before + p_amount;
  END IF;

  UPDATE canteen_wallets
  SET balance = v_balance_after,
      student_name = COALESCE(p_student_name, student_name),
      grade = COALESCE(p_grade, grade),
      last_transaction_date = v_today,
      last_transaction_at = NOW(),
      updated_at = NOW()
  WHERE id = v_wallet_id;

  INSERT INTO canteen_transactions (
    tenant_id, wallet_id, student_id, student_name, transaction_type,
    amount, balance_before, balance_after, payment_method, invoice_id,
    items, notes, transaction_date, transaction_time
  ) VALUES (
    p_tenant_id, v_wallet_id, p_student_id, p_student_name, p_txn_type,
    p_amount, v_balance_before, v_balance_after, p_payment_method, p_invoice_id,
    COALESCE(p_items, '[]'::jsonb), p_notes, v_today, v_time
  )
  RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

ALTER TABLE public.canteen_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canteen_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canteen_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'canteen_wallets', 'canteen_menu_items', 'canteen_transactions',
    'store_products', 'store_orders', 'store_order_lines'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS platform_owner_access ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated USING (tenant_id = (select public.auth_tenant_id())) WITH CHECK (tenant_id = (select public.auth_tenant_id()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY platform_owner_access ON public.%I FOR ALL TO authenticated USING ((select public.auth_is_platform_owner())) WITH CHECK ((select public.auth_is_platform_owner()))',
      tbl
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.canteen_apply_txn TO authenticated, service_role;
