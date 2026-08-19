-- Staff school store: categories, bookable availability, slot reservations.
-- Idempotent.

SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- ── Categories ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

INSERT INTO public.store_categories (tenant_id, slug, name_en, name_ar, sort_order)
SELECT t.id, c.slug, c.name_en, c.name_ar, c.sort_order
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('uniform', 'Uniforms', 'الزي المدرسي', 1),
    ('pool', 'Pool', 'المسبح', 2),
    ('playground', 'Playground', 'الملاعب', 3),
    ('other', 'Other', 'أخرى', 4)
) AS c(slug, name_en, name_ar, sort_order)
ON CONFLICT (tenant_id, slug) DO NOTHING;

ALTER TABLE public.store_products
  DROP CONSTRAINT IF EXISTS store_products_category_check;

ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.store_order_lines
  ADD COLUMN IF NOT EXISTS slot_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slot_end TIMESTAMPTZ;

-- ── Availability ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_product_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  weekday       SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  slot_minutes  INTEGER NOT NULL DEFAULT 60 CHECK (slot_minutes IN (30, 60)),
  capacity      INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_store_product_hours_product
  ON public.store_product_hours (tenant_id, product_id, weekday);

CREATE TABLE IF NOT EXISTS public.store_product_blackouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_store_product_blackouts_product
  ON public.store_product_blackouts (tenant_id, product_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.store_bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES public.store_orders(id) ON DELETE SET NULL,
  student_id  UUID REFERENCES public.students(id) ON DELETE SET NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'booking'
              CHECK (kind IN ('booking', 'block')),
  status      TEXT NOT NULL DEFAULT 'held'
              CHECK (status IN ('held', 'confirmed', 'cancelled')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_store_bookings_product_range
  ON public.store_bookings (tenant_id, product_id, starts_at, ends_at)
  WHERE status IN ('held', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_store_bookings_order
  ON public.store_bookings (tenant_id, order_id)
  WHERE order_id IS NOT NULL;

-- ── Reserve a slot atomically ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.store_reserve_slot(
  p_tenant_id UUID,
  p_product_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_order_id UUID DEFAULT NULL,
  p_student_id UUID DEFAULT NULL,
  p_kind TEXT DEFAULT 'booking',
  p_status TEXT DEFAULT 'held',
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday SMALLINT;
  v_capacity INTEGER;
  v_taken INTEGER;
  v_booking_id UUID;
  v_date DATE;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid_slot';
  END IF;

  IF p_kind NOT IN ('booking', 'block') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF p_status NOT IN ('held', 'confirmed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  PERFORM 1
  FROM store_products
  WHERE id = p_product_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  v_date := (p_starts_at AT TIME ZONE 'Asia/Riyadh')::date;
  v_weekday := EXTRACT(DOW FROM (p_starts_at AT TIME ZONE 'Asia/Riyadh'))::SMALLINT;

  IF EXISTS (
    SELECT 1 FROM store_product_blackouts
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id
      AND v_date BETWEEN start_date AND end_date
  ) THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  SELECT capacity INTO v_capacity
  FROM store_product_hours
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND weekday = v_weekday
    AND (p_starts_at AT TIME ZONE 'Asia/Riyadh')::time >= start_time
    AND (p_ends_at AT TIME ZONE 'Asia/Riyadh')::time <= end_time
  ORDER BY start_time
  LIMIT 1;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  SELECT COUNT(*) INTO v_taken
  FROM store_bookings
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND status IN ('held', 'confirmed')
    AND starts_at < p_ends_at
    AND ends_at > p_starts_at;

  IF v_taken >= v_capacity THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  INSERT INTO store_bookings (
    tenant_id, product_id, order_id, student_id,
    starts_at, ends_at, kind, status, notes
  ) VALUES (
    p_tenant_id, p_product_id, p_order_id, p_student_id,
    p_starts_at, p_ends_at, p_kind, p_status, p_notes
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_product_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_product_blackouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_bookings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'store_categories', 'store_product_hours', 'store_product_blackouts', 'store_bookings'
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

GRANT EXECUTE ON FUNCTION public.store_reserve_slot TO authenticated, service_role;
