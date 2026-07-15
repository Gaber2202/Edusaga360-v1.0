# EduSaga 360 — Messaging Integration (`/api/messaging`)

Connect a school's **SMS / WhatsApp** gateway to send notifications. One module
covers both channels because the major gateways send both over a single
account — **WhatsApp is a channel, not a separate integration.**

Providers: **Infobip, Twilio, Unifonic, MSEGAT, Taqnyat** (SMS/WhatsApp as
supported), **Meta WhatsApp Cloud API** (WhatsApp direct), and a **Custom**
gateway.

Self-service tier (like email): connector config is gated to **admin / it_admin**;
**sending** and reads are open to staff roles. Credentials are AES-256-GCM
encrypted at rest and never returned by a read.

---

## Provider / channel matrix

| Provider | SMS | WhatsApp | Credentials (secret) | Config |
|---|:--:|:--:|---|---|
| **infobip** | ✅ | ✅ | `api_key` | `base_url`, `sender`, `whatsapp_sender` |
| **twilio** | ✅ | ✅ | `account_sid`, `auth_token` | `from`, `whatsapp_from` |
| **unifonic** | ✅ | — | `app_sid` | `sender_id` |
| **msegat** | ✅ | — | `username`, `api_key` | `sender` |
| **taqnyat** | ✅ | — | `bearer_token` | `sender` |
| **meta_whatsapp** | — | ✅ | `access_token` | `phone_number_id`, `graph_version` |
| **custom** | ✅ | ✅ | `token` *(unless `auth_scheme=None`)* | `send_url`, `auth_scheme`, `auth_header` |

> **Where do WhatsApp APIs live?** Here. If you already use Infobip or Twilio,
> WhatsApp is just a channel on that same connector. If you want to go direct to
> Meta, use the **WhatsApp Cloud API (Meta)** provider.

## Endpoints

| Method & path | Roles | Purpose |
|---|---|---|
| `GET /api/messaging/providers` | staff | Provider catalog + supported channels + fields |
| `GET /api/messaging/connectors` | staff | List connectors (`has_credentials` only) |
| `POST /api/messaging/connectors` | admin/it_admin | Create `{ provider, display_name, config, credentials }` |
| `PATCH /api/messaging/connectors/:id` | admin/it_admin | Update config / credentials / active |
| `POST /api/messaging/connectors/:id/send` | staff | Send `{ to, text, channel? }` (channel defaults to the provider's first) |
| `DELETE /api/messaging/connectors/:id` | admin/it_admin | Remove a connector |

## Examples

Connect Infobip (SMS + WhatsApp) and send:

```http
POST /api/messaging/connectors
{ "provider": "infobip", "display_name": "Infobip",
  "config": { "base_url": "https://xxxxx.api.infobip.com", "sender": "EduSaga", "whatsapp_sender": "9665xxxxxxxx" },
  "credentials": { "api_key": "••••" } }
```

```http
POST /api/messaging/connectors/<id>/send
{ "to": "9665xxxxxxxx", "text": "Fees due tomorrow", "channel": "whatsapp" }
→ { "ok": true, "id": "<message-id>", "channel": "whatsapp" }
```

Direct WhatsApp via Meta:

```http
POST /api/messaging/connectors
{ "provider": "meta_whatsapp", "display_name": "WhatsApp",
  "config": { "phone_number_id": "1234567890" }, "credentials": { "access_token": "••••" } }
```

## Notes / follow-ups

- Send-only today; **inbound messages & delivery receipts are webhook-driven** and
  a planned follow-up.
- `AI_CONFIG_ENC_KEY` must be set to store credentials (same key as the other
  connectors); otherwise a credentialed connector returns `503`.
- Message-template approval (required by WhatsApp for outbound business-initiated
  messages) is handled in the provider's own console; this API sends the text you
  give it.

## Adding a provider

Implement `MessagingProvider` in
`backend/src/services/messaging/providers/<name>.ts` (declare `channels`, fields,
`validate`, `send`) and register it in `services/messaging/registry.ts`.
