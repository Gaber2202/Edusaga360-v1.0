# ZATCA Phase 2 (Fatoora) — E-Invoicing Compliance Guide

> Audience: founder + a new school's finance team onboarding to ZATCA.
> Status legend: ✅ built · 🟡 built but needs credentials/verification · ⛔ not built.

## What it is

ZATCA (Zakat, Tax and Customs Authority) Phase 2 ("Integration phase") requires
Saudi VAT-registered sellers to issue **cryptographically signed** electronic
invoices in **UBL 2.1 XML**, carry a **TLV QR code**, chain each invoice to the
previous one via a **PIH (Previous Invoice Hash)**, and submit them to ZATCA's
platform through one of two flows:

- **Clearance** — real-time, mandatory for **B2B/B2G** (standard) tax invoices.
  ZATCA must clear the invoice *before* it is shared with the buyer.
- **Reporting** — within 24h, for **B2C** (simplified) invoices.

## Current platform status

The generation + signing pipeline is implemented in
`backend/src/services/zatca.ts` and the submit flow in `backend/src/routes/billing.ts`.

| Capability | Status | Where |
|-----------|:------:|-------|
| UBL 2.1 XML generation (UUID, ICV counter, PIH chain, invoice sub-types) | ✅ | `generateUBLXml()` |
| TLV QR code (tags 1–5 base, 6–8 Phase-2: XML hash, ECDSA signature, public key) | ✅ | `generateTLVQR()` |
| ECDSA signing (`secp256k1`, SHA-256) | ✅ | `signInvoice()` |
| CSR generation for CSID onboarding | ✅ | `generateCSR()` |
| PIH hash chaining (zero-hash for first invoice) | ✅ | `generatePIH()` |
| Clearance vs reporting routing (B2B→clearance, else reporting) | ✅ | `billing.ts` (`submissionType`) |
| PDF/A-3 rendering with embedded QR (Puppeteer) | ✅ | `zatca.ts` + `lib/pdfConcurrency.ts` |
| Submission records + status tracking | ✅ | `zatca_submissions` table |
| **Signed with a real ZATCA CSID production certificate** | 🟡 | needs per-school CSID (see below) |
| **Verified end-to-end against ZATCA sandbox/simulation portal** | 🟡 | no sandbox credentials in this environment |

**Honest gap:** when **no signing key is configured**, `signInvoice()` returns a
clearly-marked **placeholder** (`unsigned:…`) so dev/sandbox flows don't crash.
This means invoices are structurally correct but **not validly signed** until each
school's CSID private key is installed. Nothing here has been round-tripped
against the live ZATCA simulation portal yet — that requires ZATCA sandbox
credentials we don't hold.

## Endpoints / config involved

- `POST /api/billing/invoices/:id/zatca-submit` — submit an invoice (finance role).
- Sandbox portal: `https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal`
- Production portal: `https://gw-fatoora.zatca.gov.sa/e-invoicing/core`
- Tenant tax identity lives on the `tenants` row: `vat_number`, `cr_number`,
  `name`/`name_ar`, `address`/`address_ar`. A school's `customer_type` (`B2B`/…)
  selects clearance vs reporting.

## Onboarding a new school to ZATCA

1. **Register the school in Fatoora** (ZATCA portal) and obtain an **OTP** for
   device/CSID onboarding.
2. **Generate a CSR** with `generateCSR()` using the school's VAT + CR details.
3. **Compliance CSID** — submit the CSR + OTP to ZATCA's compliance endpoint;
   run the required compliance checks (standard + simplified sample invoices).
4. **Production CSID** — exchange the compliance CSID for a production CSID.
5. **Install the CSID private key** for that tenant so `signInvoice()` signs with
   the real certificate (do **not** commit keys — store per-tenant secret; see
   BLOCKERS for the key-storage decision).
6. Set `customer_type` per school so clearance/reporting routes correctly.
7. Issue a first invoice — its PIH is the zero hash; verify the QR scans in
   ZATCA's validator and the clearance/reporting response is accepted.

## Gaps / to-do before production

- Per-tenant **CSID private-key storage** mechanism (Supabase Vault or KMS) — the
  code reads a key if present but the secure per-school storage/rotation is not
  wired. Track in `BLOCKERS.md`.
- **Golden-file tests** exist for XML/QR shape; expand them with ZATCA
  portal-verified samples once sandbox credentials are available.
- End-to-end **clearance/reporting** integration test against the simulation
  portal (blocked on sandbox creds).
