# EduSaga 360 — Email Integration (`/api/email`)

Connect a school's **own mailbox** so EduSaga sends from their domain and, where
the provider supports it, pulls inbound mail into the platform. Providers: **SMTP,
Gmail / Google Workspace, Microsoft 365 / Outlook**, and a **Custom** HTTP
gateway.

This is separate from the platform's default transactional sender
(`services/email.ts`, Infobip), which stays the fallback. These connectors let a
tenant send/receive through their own mail system.

---

## Provider capabilities

| Provider | Send | Receive | Credentials (secret) | Config |
|---|:--:|:--:|---|---|
| **smtp** | ✅ | — | `user`, `pass` | `host`, `port`, `from`, `secure` |
| **gmail** | ✅ | —¹ | `access_token` (OAuth) | `from` |
| **microsoft** | ✅ | ✅ | `access_token` (OAuth) | `save_to_sent` |
| **custom** | ✅ | ✅² | `token` (unless `auth_scheme=None`) | `send_url`, `messages_url`, `list_path`, `auth_scheme`, `auth_header`, `field_map` |

¹ Gmail inbound needs the Gmail API's two-step list→get expansion — a planned
follow-up; send works today.
² Custom receive is active when `messages_url` + `field_map.external_id` are set.

## How it works

```
email_connectors ── provider + config + encrypted credentials (one per mailbox)
      │  send  ─────────────────► provider transport (SMTP / Gmail / Graph / gateway)
      │  sync (receive)
      ▼
email_messages   ── inbound mail, unique (tenant, provider, external_id)
```

Credentials are **AES-256-GCM encrypted at rest** (`lib/aiCrypto`,
`AI_CONFIG_ENC_KEY`) and **never returned** by any read — lists expose only
`has_credentials`. Inbound sync is **idempotent on
`(tenant, provider, external_id)`**.

## Roles

| Action | Roles |
|---|---|
| List providers / connectors / messages, **send** | any staff role |
| Create / update / delete connectors, **inbound sync** | `admin`, `it_admin` |

## Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/email/providers` | Provider catalog + capabilities + fields |
| `GET /api/email/connectors` | List connectors (`has_credentials` only) |
| `POST /api/email/connectors` | Create `{ provider, display_name, config, credentials }` |
| `PATCH /api/email/connectors/:id` | Update `display_name` / `config` / `credentials` / `is_active` |
| `POST /api/email/connectors/:id/send` | Send `{ to, subject, html?, text? }` (html or text required) |
| `POST /api/email/connectors/:id/sync` | Pull inbound → `email_messages` (receive-capable providers) |
| `DELETE /api/email/connectors/:id` | Remove a connector |
| `GET /api/email/messages` | List synced inbound (`?provider=&connector_id=&limit=&offset=`) |

## Examples

Connect the school SMTP server and send:

```http
POST /api/email/connectors
Authorization: Bearer <supabase-jwt>

{ "provider": "smtp", "display_name": "School SMTP",
  "config": { "host": "smtp.school.sa", "port": 587, "from": "noreply@school.sa" },
  "credentials": { "user": "noreply@school.sa", "pass": "••••" } }
```

```http
POST /api/email/connectors/<id>/send
{ "to": "parent@example.com", "subject": "Welcome", "html": "<p>Ahlan wa sahlan</p>" }
→ { "ok": true, "id": "<message-id>" }
```

Sync Microsoft 365 inbound:

```http
POST /api/email/connectors/<id>/sync
→ { "ok": true, "fetched": 25, "created": 25, "updated": 0 }
```

### Custom gateway

Point `send_url` at any endpoint that accepts `{ to, subject, html, text }`; for
inbound, set `messages_url` + `field_map` (dotted paths; `external_id` required).

```jsonc
{
  "provider": "custom",
  "display_name": "Our Mail Bridge",
  "credentials": { "token": "••••" },
  "config": {
    "send_url": "https://mail.school.sa/api/send",
    "messages_url": "https://mail.school.sa/api/inbox",
    "list_path": "data.items",
    "field_map": { "external_id": "mid", "from_address": "sender", "subject": "subj", "snippet": "preview", "received_at": "date" }
  }
}
```

## Requirements

- `AI_CONFIG_ENC_KEY` (32-byte base64/hex) must be set to store connector
  credentials — the same key used for tenant LLM keys. Creating a credentialed
  connector without it returns `503 encryption_unavailable`.
- OAuth tokens (Gmail, Microsoft) are supplied by the caller; token acquisition/
  refresh is handled outside this layer during rollout.

## Adding a provider

Implement `EmailProvider` in `backend/src/services/email/providers/<name>.ts`
(declare fields, capabilities, `validate`, `send`, optional `fetchMessages`) and
register it in `services/email/registry.ts`.
