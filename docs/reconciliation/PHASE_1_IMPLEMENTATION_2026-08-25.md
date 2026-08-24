# Phase 1 implementation notes (2026-08-25)

Branch: `work-257` (contains P1-A through P1-G deliverables for local completion; split into `work-*` PRs before merge per handover §1.4).

## Completed in code

| Epic | Deliverable |
|------|-------------|
| P1-A | Enhanced `syncAuthMetadata.ts` (summary + ghosts + prod write guard); runbook; prod dry-run report (0 ghosts, 6 orphan privileged keys) |
| P1-B | `20260811_01_gl_invoice_posting.sql` + billing POST `/invoices` via `create_invoice_with_journal`; `postJournal` throws |
| P1-B CN | Credit note reverses VAT account 24; stores non-zero `vat_amount` |
| P1-C | `20260825_01_rls_legacy_claim_remediation.sql` + rollback notes (fresh snapshot required before prod) |
| P1-D | #185 residual-to-last-line; #186 preview applies discounts; #187 effective dates; #190 SADAD tenant discriminator + unique index |
| P1-E | `feeCategoryTaxMatrix.ts` + DB seed migration + bulk activation gate |
| P1-F | SAR hardcodes removed from canteen; ContractTemplates / CommandPalette / YamenAI copy de-Saudized; VATManagement gated |
| P1-G | `applyMigrations.mjs` / `verifyMigrations.mjs` + staging workflow job + status doc |

## Founder still owns

- Sign reconciliation; restore Actions billing; #160 revoke; staging Supabase project; prod metadata apply; prod RLS snapshot; decision #5 KSA national-student VAT

## Tests run locally

`feeCategoryTaxMatrix`, `feeResolution`, `phase1MoneyPath`, `billing` (incl. credit-note VAT journal) — passing.
