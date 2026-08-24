-- Phase 1 P1-D #190 — unique SADAD bill numbers (defense in depth).
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_sadad_bill_number_uq
  ON invoices (sadad_bill_number)
  WHERE sadad_bill_number IS NOT NULL AND sadad_bill_number <> '';
