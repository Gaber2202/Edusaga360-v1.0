# EduSaga 360 — ATS Integration (`/api/ats`)

Connect an external **Applicant Tracking System** and sync its candidates into
EduSaga's HR module. Supported providers: **LinkedIn Talent, Indeed, Greenhouse,
Workday**, and a fully config-driven **Custom** provider for anything else — no
code change required to add one.

This is a first-party, admin/HR surface (Supabase JWT + tenant middleware), not
part of the public `/api/v1` external API. EduSaga pulls *from* the ATS here;
`/api/v1` is for external systems pushing *into* EduSaga.

---

## How it works

```
ats_connectors ── provider + config + encrypted credentials (one per ATS)
      │  sync
      ▼
hr_candidates  ── normalized candidates, unique (tenant, provider, external_id)
```

- Each connector stores the provider id, non-secret **config** (JSONB), and a
  **credentials** blob that is **AES-256-GCM encrypted at rest** (`lib/aiCrypto`,
  key `AI_CONFIG_ENC_KEY`). The plaintext token is accepted on write, encrypted
  immediately, and **never returned** by any read.
- A **sync** fetches candidates from the provider, normalizes them to a common
  shape, and upserts into `hr_candidates` — **idempotent on
  `(tenant, provider, external_id)`**, so re-syncing updates in place.

## Roles

| Action | Roles |
|---|---|
| List providers / connectors / candidates | `admin`, `hr_head`, `hr_admin`, `hr_officer` |
| Create / update / test / sync / delete connectors | `admin`, `hr_head`, `hr_admin` |

## Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/ats/providers` | Provider catalog + the credential/config fields each needs (drives the config UI) |
| `GET /api/ats/connectors` | List configured connectors (credentials shown only as `has_credentials`) |
| `POST /api/ats/connectors` | Create a connector `{ provider, display_name, config, credentials }` |
| `PATCH /api/ats/connectors/:id` | Update `display_name` / `config` / `credentials` / `is_active` |
| `POST /api/ats/connectors/:id/test` | Validate + probe the provider; returns `{ ok, sample_count }` |
| `POST /api/ats/connectors/:id/sync` | Pull + upsert candidates; returns `{ ok, fetched, created, updated }` |
| `DELETE /api/ats/connectors/:id` | Remove a connector |
| `GET /api/ats/candidates` | List synced candidates (`?provider=&connector_id=&limit=&offset=`) |

## Provider configuration

Fetch `GET /api/ats/providers` for the authoritative field list. Summary:

| Provider | Credentials (secret) | Config |
|---|---|---|
| **greenhouse** | `api_key` (Harvest) | — |
| **workday** | `username`, `password` (ISU) | `report_url` (RaaS JSON report) |
| **linkedin** | `access_token` (OAuth) | `candidates_url` *(req)*, `contract_id` |
| **indeed** | `api_token` | `candidates_url` *(req)*, `employer_id` |
| **custom** | `token` *(unless `auth_scheme=None`)* | `base_url` *(req)*, `list_path`, `auth_scheme` (`Bearer`\|`Basic`\|`None`), `auth_header`, `field_map` *(req)* |

> LinkedIn and Indeed candidate endpoints are provisioned per partner/employer
> contract, so their exact URL is supplied via config rather than hard-coded.
> Validate live credentials against each vendor's current API during rollout.

### Custom provider — the escape hatch

Point it at any JSON candidates endpoint and describe the response with
`field_map` (dotted paths, array indices allowed). `external_id` and `full_name`
are required; `email`, `phone`, `job_title`, `stage`, `applied_at` optional.

```jsonc
{
  "provider": "custom",
  "display_name": "Our ATS",
  "credentials": { "token": "••••" },
  "config": {
    "base_url": "https://ats.example.com/api/candidates",
    "list_path": "data.items",
    "auth_scheme": "Bearer",
    "field_map": {
      "external_id": "ref",
      "full_name":   "person.name",
      "email":       "contact.mail",
      "job_title":   "role"
    }
  }
}
```

## Example: connect Greenhouse and sync

```http
POST /api/ats/connectors
Authorization: Bearer <supabase-jwt>

{ "provider": "greenhouse", "display_name": "Greenhouse", "credentials": { "api_key": "••••" } }
```

```http
POST /api/ats/connectors/<id>/sync
→ { "ok": true, "fetched": 128, "created": 128, "updated": 0 }
```

Then `GET /api/ats/candidates` returns the imported candidates.

## Requirements

- `AI_CONFIG_ENC_KEY` (32-byte base64/hex) must be set for connectors that store
  credentials — the same key used to encrypt tenant LLM keys. Creating a
  credentialed connector without it returns `503 encryption_unavailable`.

## Adding a first-class provider

Implement `AtsProvider` in `backend/src/services/ats/providers/<name>.ts`
(declare fields, `validate`, `buildPlan`) and register it in
`services/ats/registry.ts`. The fetch/normalize/upsert path is shared — a new
provider is just those two small pieces.
