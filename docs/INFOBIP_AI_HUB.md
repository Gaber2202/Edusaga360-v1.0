# Infobip AI Hub — Parent WhatsApp/SMS Assistant

This document describes the EduSaga 360 integration with Infobip AI Hub / Conversations: an Arabic-first, 24/7 conversational assistant that parents can reach on WhatsApp or SMS.

## What it does

When a parent sends a message to the school’s Infobip WhatsApp/SMS number, the backend:

1. Identifies the guardian by phone number.
2. Creates (or re-opens) an `ai_parent` conversation thread.
3. Classifies the intent in Arabic or English.
4. Replies instantly with real school data or a menu.
5. Escalates to staff when the guardian asks for a human.

Supported intents:

- **Greeting / menu** — Shows the available options.
- **Fees & balance** — Total outstanding and invoice list.
- **Payment link** — A live Moyasar checkout link for the oldest outstanding invoice.
- **Admissions** — Application status by guardian phone number.
- **Attendance** — Placeholder (student attendance will be wired when the module is live).
- **Documents** — Redirects to the parent portal.
- **Human handoff** — Marks the thread `handoff` so staff can take over.

## Webhook endpoint

Configure the Infobip inbound message webhook to:

```
POST https://edusaga-360-production.up.railway.app/api/webhooks/infobip/inbound
```

For extra security, set `INFOBIP_WEBHOOK_SECRET` in Railway and append it as a query token:

```
/api/webhooks/infobip/inbound?token=<INFOBIP_WEBHOOK_SECRET>
```

or send it as the `x-infobip-webhook-secret` header.

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `INFOBIP_BASE_URL` | e.g. `https://55e51x.api.infobip.com` |
| `INFOBIP_API_KEY` | Infobip API key |
| `INFOBIP_SMS_SENDER` | SMS sender ID, e.g. `EduSaga` |
| `INFOBIP_WHATSAPP_SENDER` | WhatsApp sender number, e.g. `447860088970` |
| `INFOBIP_WEBHOOK_SECRET` | Optional shared secret for inbound webhook validation |
| `FRONTEND_URL` | Used to build the Moyasar callback URL. Defaults to `https://parentportal.edusaga360.com` |

## Database

Run migration `shared/database/migrations/20260729_ai_hub.sql` to add AI-thread state to `message_threads`.

## Infobip portal setup (optional enhancements)

The local intent router works out of the box. To use Infobip AI Hub features directly (Answers chatbot, AI Assistant, Flows):

1. Create an **AI Assistant** in Infobip AI Hub and upload an EduSaga FAQ document.
2. Create an **Answers chatbot** that uses the AI Assistant as a knowledge source.
3. Add an **Open channel** sender and point it at `/api/webhooks/infobip/inbound`.
4. The chatbot will forward user messages to the endpoint and the endpoint will reply with both local data and AI-generated text.

For now, the endpoint uses a rule-based AI pipeline so it works without an Infobip AI Assistant license.

## Testing

Send a WhatsApp message to the configured Infobip WhatsApp sender:

- Arabic: `مرحبا` or `رسوم`
- English: `hello` or `fees`

Expected behavior: the assistant replies in the same language with the guardian’s outstanding balance or a menu.
