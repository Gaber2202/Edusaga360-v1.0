# PDPL — Saudi Personal Data Protection Law: Platform Posture

> Audience: founder + client due-diligence. Written to be **honest about gaps**,
> because a Saudi school engagement will ask these questions directly.

## What it is

The **Personal Data Protection Law (PDPL)**, enforced by **SDAIA**, governs how
personal data of individuals in Saudi Arabia is collected, processed, stored,
transferred, and retained. For a K-12 SaaS handling **children's** data plus
guardian and staff PII, the sensitive-data and data-subject-rights provisions are
directly in scope.

## Current platform status

| Area | Status | Detail |
|------|:------:|--------|
| Tenant isolation | ✅ | Every table has RLS; one school cannot read another's data (live-verified). |
| PII encryption at rest | ✅ (partial) | `national_id`, `iqama_number`, `passport_number`, `bank_iban` are encrypted with `pgp_sym_encrypt` (see `20260610_pii_encryption.sql`). Encryption helper functions are locked to `service_role` only (`20260704_revoke_anon_pii_function_execute.sql`). |
| Transport encryption | ✅ | HTTPS everywhere; HSTS via `helmet`. |
| Access control / audit | ✅ | Role-based access; `audit_logs` table records privileged actions. |
| **Data residency in Saudi Arabia** | ⛔ **GAP** | The Supabase project runs in region **`ap-northeast-2` (Seoul, South Korea)** — **not** in-Kingdom. See below. |
| Consent capture at intake | 🟡 | Parent intake collects data; an explicit, logged **consent checkpoint** should be confirmed/added. |
| Data-subject requests (access/rectify/erase) | 🟡 | No self-service DSR workflow yet; can be served manually via the DB. |
| Retention & deletion policy | 🟡 | No automated retention/purge schedule defined. |

## ⛔ Data residency — the headline item

**Personal data is currently stored in Seoul, not Saudi Arabia.** PDPL restricts
cross-border transfer of personal data; storing Saudi residents' (and minors')
data outside the Kingdom generally requires a lawful transfer basis and/or
SDAIA-approved conditions, and many Saudi education clients will require
**in-Kingdom hosting** outright.

**Options to close it (a business + infra decision — flag to the client early):**
1. Migrate the Supabase project to an **in-Kingdom region** (e.g. a KSA cloud
   region / local Supabase deployment) — cleanest for compliance.
2. Obtain a documented **lawful-transfer basis** + explicit consent, if the client
   accepts it (weaker, and many public/large schools won't).

This is not a code fix — it's a hosting decision. It belongs in the client
conversation now, not at signing.

## Consent points in parent intake

Intake is handled via `POST /api/intake` and the `applicants`/`applications`
tables. Recommended (confirm current state, add if missing):
- An explicit, **timestamped consent** record at submission (what data, why, for
  how long), stored alongside the application.
- A clear privacy notice in Arabic + English at the point of collection.

## Data-subject request (DSR) handling

Today: served manually by an operator with DB access (read/rectify via the app;
erase via a scripted, audited deletion). Recommended: a lightweight DSR intake +
fulfilment log so requests are tracked and answered within PDPL timelines.

## Retention

Define per data class (e.g. applications not converted to enrolment, ex-staff
records, financial records that Saudi tax law requires kept for a set period —
note tax retention can *override* a shorter PDPL preference). Then automate purge.
Not yet implemented.

## Gaps summary (for the client)

- ⛔ **Data residency** (Seoul → in-Kingdom) — biggest item, hosting decision.
- 🟡 Explicit consent checkpoint + bilingual privacy notice at intake.
- 🟡 Self-service DSR workflow + fulfilment log.
- 🟡 Documented, automated retention/deletion schedule.
