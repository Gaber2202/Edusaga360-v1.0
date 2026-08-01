---
name: testing-moyasar-payments
description: How to end-to-end test EduSaga 360 Moyasar payment flows locally using a mock Moyasar server and the demo tenant.
---

# Testing EduSaga 360 Moyasar / Currency Flows

Use this skill when verifying the Moyasar payment-link creation, public billing webhook, subscription seat-upgrade webhook, cheque clearing, or `lib/money.ts` currency/minor-unit behavior on a local dev stack.

## Devin Secrets Needed

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — for verifying `invoices`, `payments`, `moyasar_invoices`, `moyasar_payments`, `cheques`, `journal_entries`, etc.
- `SUPABASE_ANON_KEY` — to sign in the demo test user via `POST /auth/v1/token?grant_type=password`.

## Demo tenant and test user

- Tenant: `00000000-0000-0000-0000-000000000001`
- Staff test user (if already seeded): `test-1785554505654@edusaga.local` / `TestPass123!`
- If the user does not exist, create it with `backend/src/scripts/createTestUser.ts` and grant `admin`/`finance` roles.

## Required local services

1. **Backend** on `http://localhost:3001`:
   ```bash
   cd backend
   MOYASAR_SECRET_KEY_TEST=sk_test_dummy \
   MOYASAR_API_KEY=sk_test_dummy \
   MOYASAR_WEBHOOK_SECRET=test-secret \
   MOYASAR_API_BASE=http://localhost:3003/v1 \
     npm run dev
   ```
   `MOYASAR_API_BASE` is not present in the unpatched branch and must be added temporarily to `moyasarClient.ts` and `subscription.ts` (report this as a needed fix).

2. **Frontend** on `http://localhost:5173`:
   ```bash
   cd frontend && npm run dev
   ```

3. **Mock Moyasar server** on `http://localhost:3003/v1`:
   Save `/tmp/mock-moyasar.mjs` with handlers for:
   - `POST /v1/invoices` → `{ id: <uuid>, amount, currency, url, status: 'initiated', metadata }`
   - `POST /v1/payments` → same shape
   - `PUT|POST /v1/invoices/:id/cancel` → `{ id, status: 'canceled' }`

## Common API verification checks

### Create invoice + Moyasar link

```bash
TOKEN=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-1785554505654@edusaga.local","password":"TestPass123!"}' | jq -r '.access_token')

curl -s -X POST http://localhost:3001/api/billing/invoices \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "student_id":"ed466636-6cca-44ae-a676-6b31780da611",
    "academic_year":"2025-2026",
    "due_date":"2026-08-08",
    "payment_methods":["mada"],
    "fee_lines":[{"description_en":"Tuition Fee","description_ar":"رسوم دراسية","amount":1000,"quantity":1}]
  }' | jq '.payment_link'
```

Expect:
- `payment_link.amountMinor == 115000` for SAR.
- `moyasar_invoices.amount_minor == 115000`, `currency_code == 'SAR'`.
- Mock server body `amount == 115000`, `currency == 'SAR'`.

### Public webhook

```bash
curl -s -X POST http://localhost:3001/api/public/billing/moyasar/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "evt_test_1",
    "type": "payment_paid",
    "secret_token": "test-secret",
    "data": {
      "id": "moyasar-pmt-1",
      "status": "paid",
      "amount": 115000,
      "fee": 3450,
      "currency": "SAR",
      "invoice_id": "<moyasar_id>",
      "metadata": { "edusaga_invoice_id": "<invoice_id>", "tenant_id": "00000000-0000-0000-0000-000000000001" },
      "source": { "type": "mada" }
    }
  }'
```

### Subscription seat upgrade

```bash
curl -s -X POST http://localhost:3001/api/subscription/orders \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"order_type":"add_seats","additional_seats":2,"payment_method":"online"}'

curl -s -X POST http://localhost:3001/api/subscription/orders/<order_id>/payment-link \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{}'

curl -s -X POST http://localhost:3001/api/subscription/webhook/moyasar \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"moyasar-pmt-sub-1","status":"paid","amount":115000,"secret_token":"test-secret","metadata":{"order_id":"<order_id>","tenant_id":"<tenant_id>","type":"subscription"}}'
```

**Note:** The subscription webhook is behind `authMiddleware` in the current branch; for a real Moyasar callback it must be public.

### Cheque clear

```bash
curl -s -X POST http://localhost:3001/api/cheques \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "cheque_number":"CHQ-158-001",
    "bank_name":"Test Bank",
    "drawer_name":"Guardian",
    "amount":575,
    "due_date":"2026-08-08",
    "invoice_id":"<invoice_id>"
  }'

curl -s -X POST http://localhost:3001/api/cheques/<cheque_id>/transition \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"to_status":"deposited"}'

curl -s -X POST http://localhost:3001/api/cheques/<cheque_id>/transition \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"to_status":"cleared"}'
```

**Do not send a `currency` field** in the create-cheque body; the table uses `currency_code` and spreading `parsed.data` will fail if `currency` is present.

## Adversarial zero-decimal currency (JPY)

1. Insert `JPY` into `currencies` with `minor_units=0`.
2. Create an invoice, then update `invoices.currency_code='JPY'`, `total_amount=1150`, `paid_amount=0` (`balance` is generated from `total_amount - paid_amount`).
3. Call `POST /api/billing/moyasar/link` with `invoice_id`.
4. Verify mock server received `amount: 1150` (not `115000`) and `currency: JPY`.
5. Post public webhook with `amount: 1150`, `currency: JPY`.
6. Verify `moyasar_payments`, `payments`, and `invoices` all have `currency_code='JPY'` and `amount_minor/amount=1150`.

## Known limitations

- The requested demo tenant (`000...`) may not be accessible through the UI login form in this branch; use API calls for full end-to-end verification and use the existing `b000...` platform-owner UI session for screenshots.
- `postJournal` requires chart-of-accounts rows (codes `11` and `12`) for the tenant; if they are missing, no `journal_entries` will be created for cheque clears.
