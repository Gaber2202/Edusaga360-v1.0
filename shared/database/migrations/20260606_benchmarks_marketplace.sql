-- ============================================================
-- Phase 4: Anonymous Benchmarking + Vendor Marketplace
-- ============================================================

-- Cached benchmark snapshots (recomputed nightly / on-demand)
-- Each row = one tenant's anonymised contribution to the pool
CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  school_type   TEXT,   -- government | private | international (kept for segmentation)
  city          TEXT,   -- city only — no school name
  -- Workforce
  employee_count        INTEGER,
  saudi_pct             NUMERIC(5,2),   -- % Saudi employees
  avg_basic_salary      NUMERIC(12,2),
  -- Attendance
  avg_attendance_rate   NUMERIC(5,2),   -- % present days in last 30d
  avg_late_rate         NUMERIC(5,2),
  -- Leave
  avg_pending_leave_days NUMERIC(8,2),
  -- Fees
  fee_collection_rate   NUMERIC(5,2),   -- % invoices paid
  avg_invoice_amount    NUMERIC(12,2),
  -- Students
  student_count         INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, snapshot_date)
);

ALTER TABLE benchmark_snapshots ENABLE ROW LEVEL SECURITY;
-- No RLS tenant filter — benchmarks read all (server-side aggregates only, no raw data exposed)
CREATE POLICY "authenticated_read" ON benchmark_snapshots FOR SELECT USING (TRUE);
CREATE POLICY "service_write"      ON benchmark_snapshots FOR ALL  USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_benchmark_date       ON benchmark_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_type       ON benchmark_snapshots(school_type, snapshot_date DESC);

-- Vendor marketplace (cross-tenant, platform-level)
CREATE TABLE IF NOT EXISTS marketplace_vendors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  category        TEXT NOT NULL,  -- books | uniforms | technology | maintenance | catering | transport | hr_services | other
  description_en  TEXT,
  description_ar  TEXT,
  website         TEXT,
  phone           TEXT,
  email           TEXT,
  city            TEXT,
  logo_url        TEXT,
  is_verified     BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  avg_rating      NUMERIC(3,2) DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE marketplace_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read"   ON marketplace_vendors FOR SELECT USING (is_active = TRUE);
CREATE POLICY "service_write" ON marketplace_vendors FOR ALL   USING (TRUE);

CREATE INDEX IF NOT EXISTS idx_marketplace_category ON marketplace_vendors(category);

-- Vendor reviews (one per tenant per vendor)
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id   UUID NOT NULL REFERENCES marketplace_vendors(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (vendor_id, tenant_id)
);

ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_write" ON marketplace_reviews USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
CREATE POLICY "vendor_read"       ON marketplace_reviews FOR SELECT USING (TRUE);

-- Procurement requests (tenant-scoped)
CREATE TABLE IF NOT EXISTS procurement_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id       UUID REFERENCES marketplace_vendors(id),
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  estimated_value NUMERIC(15,2),
  status          TEXT DEFAULT 'draft',  -- draft | submitted | quoted | approved | rejected | completed
  requested_by    UUID,
  approved_by     UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON procurement_requests USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);
CREATE INDEX IF NOT EXISTS idx_procurement_tenant ON procurement_requests(tenant_id, status);
