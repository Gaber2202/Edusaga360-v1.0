# EduSaga 360 — External Integration API (`/api/v1`)

The External Integration API is how a school connects **outside systems** to
EduSaga 360 — migrating a legacy SIS, syncing an ATS (LinkedIn / Indeed /
Greenhouse), wiring up email, etc. It is a **server-to-server** API authenticated
by **tenant-scoped API keys**, separate from the Supabase-JWT sessions the three
first-party web apps use.

> **Status:** Foundation. This ships the auth layer, key management, scope model,
> and a worked example resource (`students`). Additional resources (staff,
> invoices, attendance, …) and provider-specific connectors (ATS, email) build on
> top of this and follow the same pattern.

---

## 1. Authentication

Every `/api/v1` request must present an API key, either header works:

```
Authorization: Bearer esk_live_xxxxxxxxxxxxxxxxxxxxxxxx
# or
X-API-Key: esk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

- Keys look like `esk_<env>_<random>` (`live` in production, `test` otherwise).
- Only a **SHA-256 hash** of each key is stored — the plaintext is shown **once**,
  at creation. Store it in your integration's secret manager; it cannot be
  retrieved again.
- The **tenant is derived from the key** by the backend. You never send a
  tenant id; a key can only ever read/write its own school's data.
- Keys can be scoped, given an expiry, and revoked at any time.

Failure responses are a uniform `401` (`{"error":"unauthorized"}`) for missing,
malformed, unknown, wrong-secret, revoked, or expired keys — the API never
reveals which.

## 2. Scopes

A key is granted an explicit allow-list of scopes. An endpoint returns `403`
(`{"error":"forbidden"}`) if the key lacks the scope it requires.

| Scope | Grants |
|---|---|
| `students:read` | List students |
| `students:write` | Create / upsert students |
| `staff:read` | (reserved — staff read, coming next) |
| `invoices:read` | (reserved — invoice read, coming next) |

Scopes are defined in `backend/src/lib/apiScopes.ts`; add one there before
gating an endpoint with it.

## 3. Managing keys (admins)

Keys are minted from the **control plane** at `/api/api-keys`, which is
first-party and **admin-only** (Supabase JWT + `admin` role). This is what the
in-app "Integrations" screen calls.

```http
POST /api/api-keys
Authorization: Bearer <supabase-jwt>
Content-Type: application/json

{ "name": "Legacy SIS migration", "scopes": ["students:read","students:write"], "expires_at": "2027-01-01T00:00:00Z" }
```

Response (**the only time `api_key` is returned**):

```json
{ "id": "…", "name": "Legacy SIS migration", "key_prefix": "esk_live_ab12cd34",
  "scopes": ["students:read","students:write"], "expires_at": "2027-01-01T00:00:00Z",
  "created_at": "…", "api_key": "esk_live_ab12cd34…" }
```

| Method & path | Purpose |
|---|---|
| `POST /api/api-keys` | Mint a key (returns the secret once) |
| `GET /api/api-keys` | List this tenant's keys (metadata only) |
| `DELETE /api/api-keys/:id` | Revoke a key |

## 4. Endpoints (`/api/v1`)

### Meta

| Method & path | Scope | Description |
|---|---|---|
| `GET /api/v1/ping` | — | Liveness + "is my key valid" check |
| `GET /api/v1/whoami` | — | Returns `{ tenant_id, scopes }` for the key |

### Students

| Method & path | Scope | Description |
|---|---|---|
| `GET /api/v1/students` | `students:read` | Paginated list (`?limit=&offset=`, max 200) |
| `POST /api/v1/students` | `students:write` | Create a student |

`POST /api/v1/students` is **idempotent on `national_id`** within the tenant: a
re-POST of an already-imported record returns `200 {created:false}` with the
existing id instead of creating a duplicate — safe to re-run a migration.

```http
POST /api/v1/students
X-API-Key: esk_live_…
Content-Type: application/json

{ "name_en": "Ahmed Ali", "name_ar": "أحمد علي", "national_id": "1012345678",
  "date_of_birth": "2015-04-01", "gender": "male", "nationality": "SA" }
```

```json
{ "data": { "id": "…" }, "created": true }
```

## 5. Errors

| Status | `error` | When |
|---|---|---|
| `400` | `validation_error` | Body failed schema validation (see `details`) |
| `401` | `unauthorized` | Missing / invalid / revoked / expired key |
| `403` | `forbidden` | Key lacks the required scope |
| `429` | `rate_limited` | Over 300 requests/min |
| `500` | `server_error` | Unexpected backend failure |

## 6. Notes for the next resources

To add an endpoint: declare its scope in `lib/apiScopes.ts`, add the route in
`routes/external/v1.ts` behind `requireScope(...)`, and scope **every** query by
`req.apiClient.tenantId`. Mirror the students read/idempotent-write shape.
