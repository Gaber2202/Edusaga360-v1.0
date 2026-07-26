-- RLS penetration test for the Enterprise Invoicing Engine tables.
-- Run against a test Supabase database with `psql` or the Supabase SQL Editor.
-- The script creates test tenants/users, attempts cross-tenant reads/writes,
-- and raises an exception if any isolation rule is violated.

DO $$
DECLARE
  tenant_a UUID := '00000000-0000-0000-0000-000000000001';
  tenant_b UUID := '00000000-0000-0000-0000-000000000002';
  user_a UUID := '00000000-0000-0000-0000-00000000000a';
  user_b UUID := '00000000-0000-0000-0000-00000000000b';
  inv_a UUID;
  count_a INT;
  count_b INT;
  leaked BOOLEAN;
BEGIN
  -- Clean previous test state
  DELETE FROM invoice_share_tokens WHERE tenant_id IN (tenant_a, tenant_b);
  DELETE FROM invoices WHERE tenant_id IN (tenant_a, tenant_b);
  DELETE FROM tenants WHERE id IN (tenant_a, tenant_b);

  INSERT INTO tenants (id, name_en, name_ar, status) VALUES (tenant_a, 'Tenant A', 'المستأجر أ', 'active');
  INSERT INTO tenants (id, name_en, name_ar, status) VALUES (tenant_b, 'Tenant B', 'المستأجر ب', 'active');

  INSERT INTO invoices (tenant_id, invoice_number, document_type, invoice_type, status, subtotal, vat_amount, total_amount, paid_amount, balance, issue_date, date, academic_year)
  VALUES (tenant_a, 'INV-RLS-A', 'invoice', 'simplified', 'issued', 1000, 150, 1150, 0, 1150, CURRENT_DATE, CURRENT_DATE, '2026')
  RETURNING id INTO inv_a;

  -- Tenant A should see the invoice
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_a)::text, true);
  SELECT COUNT(*) INTO count_a FROM invoices;
  ASSERT count_a >= 1, 'Tenant A user could not read their own invoice';

  -- Tenant B should not see the invoice
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_b)::text, true);
  SELECT COUNT(*) INTO count_b FROM invoices WHERE id = inv_a;
  ASSERT count_b = 0, 'Tenant B leaked invoice from Tenant A';

  -- Invoice share tokens must be isolated by tenant
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_a)::text, true);
  INSERT INTO invoice_share_tokens (tenant_id, invoice_id, token, channel)
  VALUES (tenant_a, inv_a, 'token-a', 'link');

  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_b)::text, true);
  BEGIN
    SELECT COUNT(*) INTO count_b FROM invoice_share_tokens WHERE token = 'token-a';
    ASSERT count_b = 0, 'Tenant B leaked share token from Tenant A';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Cross-tenant UPDATE must be blocked
  leaked := false;
  PERFORM set_config('request.jwt.claims', json_build_object('tenant_id', tenant_a)::text, true);
  BEGIN
    UPDATE invoices SET tenant_id = tenant_b WHERE id = inv_a;
    leaked := true;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  ASSERT NOT leaked, 'Cross-tenant invoice UPDATE was not blocked by RLS';

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{}', true);
  DELETE FROM invoice_share_tokens WHERE tenant_id IN (tenant_a, tenant_b);
  DELETE FROM invoices WHERE tenant_id IN (tenant_a, tenant_b);
  DELETE FROM tenants WHERE id IN (tenant_a, tenant_b);

  RAISE NOTICE 'Invoice RLS penetration test passed.';
END $$;
