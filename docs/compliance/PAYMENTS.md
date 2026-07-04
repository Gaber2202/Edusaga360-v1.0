# Payments — Setup, Flows & Compliance Guide

> Audience: founder + a new school's finance team. Covers the payment gateways,
> settlement, refunds, and webhook configuration.

## What it is

EduSaga 360 collects subscription/seat payments (platform billing) and is built to
collect school fees, primarily via **Moyasar** (a Saudi payment gateway supporting
**mada**, Visa, Mastercard, Apple Pay), with a **wire-transfer** path as a
fallback and **Tap/HyperPay** named as future gateways.

## Current platform status

| Capability | Status | Where |
|-----------|:------:|-------|
| Moyasar hosted payment link (subscription/seat orders) | ✅ | `POST /api/subscription/orders/:id/payment-link` |
| Moyasar webhook — **signature (shared secret) verified** | ✅ | `POST /api/subscription/webhook/moyasar` |
| Moyasar webhook — **server-side amount verification** | ✅ | rejects if paid ≠ order total |
| Idempotent webhook (no double-apply) | ✅ | order state machine `pending_payment → paid/verified` |
| Wire-transfer path (upload proof → finance verifies → apply) | ✅ | `subscription.ts` + `bank-details` |
| Entitlements granted **only after** verified payment | ✅ | `applyUpgrade()` gated on paid/verified |
| Tap / HyperPay gateways | ⛔ | named as future; not implemented |
| Refunds | 🟡 | not automated in-app; done via gateway dashboard today |

**Security note (why this matters to a client):** the webhook now enforces two
independent server-side checks — a shared secret (`MOYASAR_WEBHOOK_SECRET`) and an
exact amount match — so a forged "paid" callback cannot grant a plan for free.
This closed a real P0 found during the readiness sprint.

## Config involved (per environment)

| Variable | Purpose |
|----------|---------|
| `MOYASAR_API_KEY` | Secret key used server-side to create hosted invoices. |
| `MOYASAR_WEBHOOK_SECRET` | **Required in production.** Shared "secret token" set on the Moyasar webhook; the handler rejects callbacks that don't present it. |
| `FRONTEND_URL` | Base for the post-payment redirect (`callback_url`). |

Bank-transfer account details are configurable in `platform_settings`
(`GET /api/subscription/bank-details`).

## Payment flow (online / Moyasar)

1. Finance creates an order → status `pending_payment`.
2. `POST /orders/:id/payment-link` creates a Moyasar hosted invoice; user pays.
3. Moyasar redirects the browser back to `FRONTEND_URL/...?payment=complete`.
4. Moyasar's **server-to-server webhook** hits `/api/subscription/webhook/moyasar`:
   the handler verifies the **secret**, verifies the **amount**, marks the order
   `paid`, and applies the upgrade — **idempotently**.

> ⚠️ Routing note (PAY-03 in `BLOCKERS.md`): the webhook currently sits behind the
> authenticated router, so a real JWT-less Moyasar callback may not reach it.
> Confirm the Moyasar dashboard webhook URL and decide public routing before
> relying on online auto-apply. The wire-transfer path is unaffected.

## Payment flow (wire transfer)

1. Order created → user chooses bank transfer → uploads the transfer receipt.
2. Order moves to `awaiting_verification`.
3. Finance verifies the receipt → status `verified` → entitlement applied.

## mada / settlement / refunds

- **mada** is supported through Moyasar (Saudi domestic debit) — confirm it's
  enabled on the merchant account.
- **Settlement** timing is per the Moyasar merchant agreement (typically T+n).
- **Refunds** are currently issued from the Moyasar dashboard; an in-app refund +
  invoice-state reversal is a recommended enhancement.

## Onboarding a new school's payments

1. Create/lease a **Moyasar merchant account** for the school (or route through the
   platform account, per your commercial model).
2. Set `MOYASAR_API_KEY` and `MOYASAR_WEBHOOK_SECRET` for the environment.
3. In the Moyasar dashboard, configure the **webhook URL** with the same secret.
4. Confirm **mada** + card methods are enabled.
5. Test a live-sandbox payment end-to-end (needs Moyasar sandbox creds).

## Gaps

- ⛔ Tap/HyperPay adapters (fallback gateways) — not built.
- 🟡 In-app refunds + invoice-state reversal.
- 🟡 End-to-end sandbox verification of the online flow (blocked on creds).
- 🟡 PAY-03 webhook routing decision (see BLOCKERS).
