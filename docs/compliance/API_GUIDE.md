# API Guide — Third-Party Integration

> Audience: a third-party integrator (or the client's IT team). Describes the
> current API surface honestly, including what is **not** yet published.

## Overview

EduSaga 360's backend is an **Express + TypeScript** API (deployed on Railway).
All business endpoints live under `/api/*`. Authentication is a **Supabase JWT**
(Bearer token); tenant scope and role come from the token's `app_metadata`.

**Current maturity (honest):**
- ✅ A machine-readable **OpenAPI 3.1 spec** is published at
  [`docs/api/openapi.yaml`](../api/openapi.yaml), covering the core operations
  (health, fees/invoices/payments, ZATCA submit, subscription payment-link +
  webhook, leave submit/approve, admin tenants). Load it into Swagger UI, Postman,
  or Insomnia to explore.
- ⛔ There is still **no versioned `/api/v1/…` surface** — the spec documents the
  current **unversioned** app API; treat those endpoints as subject to change
  until `/v1` is cut.
- ✅ Auth, tenant isolation, and rate limiting are in place.

## Authentication

1. Authenticate against Supabase Auth to obtain a JWT (email/password today).
2. Send it on every request:
   ```
   Authorization: Bearer <supabase_jwt>
   ```
3. The server validates the token (`supabase.auth.getUser`) and reads
   `tenant_id`, `role`, `is_platform_owner` from **`app_metadata`** only
   (user-writable `user_metadata` is intentionally ignored — no self-escalation).
4. Requests without a valid token get `401`; a valid token with no tenant gets
   `403` ("No tenant assigned").

> API keys per tenant are **not** implemented yet — auth is JWT-only. A per-tenant
> API-key layer is part of the planned `/v1` work.

## Rate limits

| Scope | Limit |
|-------|-------|
| Authenticated API (global) | 120 requests / minute |
| Public registration | 5 requests / 15 minutes |

`429` responses carry standard `RateLimit-*` headers.

## Public endpoints (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + active AI provider. |
| POST | `/api/auth/*` | Login / password reset. |
| POST | `/api/registration/*` | Public school registration (rate-limited). |

Example:
```bash
curl -s https://<api-host>/api/health
# {"status":"ok","timestamp":"…","version":"1.0.0","ai_provider":"…"}
```

## Authenticated endpoint groups (all require Bearer JWT + tenant)

`/api/invoices`, `/api/billing`, `/api/fees`, `/api/cheques`, `/api/payroll`,
`/api/journal-entries`, `/api/leave`, `/api/attendance-policy`, `/api/notifications`,
`/api/benchmarks`, `/api/marketplace`, `/api/tenant-users`, `/api/parents`,
`/api/files`, `/api/exec`, `/api/subscription`, `/api/intake`, `/api/ai`,
`/api/admin` (platform-owner scoped).

## Top operations (examples)

```bash
# List invoices for the caller's tenant
curl -s https://<api-host>/api/billing/invoices \
  -H "Authorization: Bearer $JWT"

# Get one invoice with its ZATCA + payment detail
curl -s https://<api-host>/api/billing/invoices/$ID \
  -H "Authorization: Bearer $JWT"

# Submit an invoice to ZATCA (finance role)
curl -s -X POST https://<api-host>/api/billing/invoices/$ID/zatca-submit \
  -H "Authorization: Bearer $JWT"

# Create a Moyasar payment link for a subscription order (admin role)
curl -s -X POST https://<api-host>/api/subscription/orders/$ORDER/payment-link \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"callback_url":"https://app.example/return"}'
```

> Exact request/response schemas per endpoint are defined in the route handlers
> under `backend/src/routes/`. A machine-readable **OpenAPI 3.1** spec
> (`docs/api/openapi.yaml`) is a planned deliverable and does not exist yet.

## Error envelope

Handlers generally return JSON with a `message` or `error` field and an
appropriate HTTP status (`400/401/403/404/429/500`). The envelope is **not yet
fully standardised** across all routes — a consistent `{ error: { code, message } }`
shape is part of the planned `/v1` hardening.

## Tenant isolation guarantee

The backend uses the Supabase service-role key and **explicitly scopes every
query by `tenant_id`**, backed by RLS on all tables. A caller can only ever read
or write their own tenant's data (verified by the `rf006-tenant-idor`,
`tenant-isolation`, and `rbac-isolation` test suites, and a live isolation probe
during the readiness sprint).

## Gaps (planned `/v1` work)

- ✅ **OpenAPI 3.1 spec published** (`docs/api/openapi.yaml`). ⛔ Versioned
  `/api/v1/*` surface still pending (would freeze a stable contract).
- ⛔ Per-tenant **API keys** (in addition to JWT).
- 🟡 Standardised error envelope across all routes.
- 🟡 A **sandbox tenant** + example collection for integrators.
