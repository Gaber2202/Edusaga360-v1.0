# ADR-006: Document Generation and Jurisdiction Ownership

## Status

**Proposed** — decision required before Task 7 (CI country-literal lint) and Task 9 (UAE pack). Does not block Task 5.

## Context

The Task 5 Step 1 inventory found roughly 20 frontend components generating documents, reports and filings. The `CountryPack` interface defines a `DocumentsService` slot, but packs live in the backend, so `saPack.documents` is currently typed `never` with a TODO.

The naive readings are both wrong:

- **Move all 20 to the backend.** A large, behaviour-changing migration that would swamp Task 5's byte-identical acceptance bar and delay UAE work for weeks. Most of these documents are not jurisdiction-specific in any meaningful way.
- **Leave all 20 in the frontend.** Then employment contracts and HR termination letters citing Saudi Labour Law have no pack owning them. When Task 9 adds the UAE, its letters must cite MOHRE and a different end-of-service formula — and there is nowhere for that to live except more frontend branching, which is precisely the scattering the pack architecture exists to end.

The inventory also surfaced two defects that are not document-architecture questions at all:

1. `EOSBCalculator.jsx` computes end-of-service benefit in the browser. EOSB is a **payroll rule** — `PayrollService.endOfServiceBenefit()` already exists as a pack interface member. The calculation currently lives in two places and can disagree, meaning a settlement letter could state a different figure from what payroll pays.
2. `VATManagement.jsx` hardcodes the 15% VAT rate. Rates belong in `jurisdiction_tax_rules` with effective dating, not in a React component.

## Decision

Classify every document by **who owns its correctness**, not by where it currently runs.

### Category A — Jurisdiction-critical legal documents → move to `packs/{code}/documents`

Documents whose text carries legal force and changes entirely by country.

| Component | Why |
|---|---|
| `YamenDraftDocuments.jsx` | Warning, termination, increment, EOS settlement, iqama renewal letters. Saudi Labour Law article references, EOS formula, بسم الله. UAE equivalents cite different law entirely. |
| `YamenDocumentGenerator.jsx` + `yamenUtils.jsx` | Offer, termination, promotion, warning letters with Saudi Labour Law clauses. |
| `ContractPreviewModal.jsx` / `Contracts.jsx` | Student and guardian contracts. CR number, VAT number, jurisdiction-specific clauses and signature blocks. |

Rendered server-side via the existing Puppeteer path already used for invoice and payslip PDFs.

### Category B — Regulatory filings → move to `packs/{code}` as `RegulatorReportsService`

Submissions to a named regulator. Jurisdiction-specific by definition; there is no country-neutral version.

| Component | Regulator |
|---|---|
| `VATManagement.jsx` (VAT return) | ZATCA |
| `HRManagerDashboard.jsx` (MHRSD report) | MHRSD / Nitaqat |
| WPS / Mudad bank file *(already backend)* | Mudad |
| GOSI contribution output *(already backend)* | GOSI |

### Category C — Generic business documents → stay in the frontend, consume localisation from the pack

Structure is universal; only currency format, date format, language and text direction vary. A trial balance is a trial balance in any country.

`Reports.jsx` + `reportPrint.js`, `PurchaseOrders.jsx`, `PurchaseRequisitions.jsx`, `APBills.jsx`, `FinancialStatements.jsx`, `TrialBalance.jsx`, `GeneralLedger.jsx`, depreciation / attendance / student exports.

These consume a **localisation payload** served from the pack via an API endpoint: currency code and symbol, minor units, number format, date format, calendar systems, text direction, and shared labels. **No country logic in the frontend — only data received from the backend.**

Already-backend documents (invoice PDF, payslip PDF) need no change.

### Two defects fixed separately from all of the above

- **EOSB** moves to `PayrollService.endOfServiceBenefit()` in `packs/sa`. The frontend calls an endpoint. This is a correctness fix, not a refactor.
- **VAT rate** is read from `jurisdiction_tax_rules` with effective dating, never hardcoded.

## Consequences

**Positive**
- Roughly 6 components move rather than 20. Weeks of work avoided.
- Every document whose correctness is jurisdiction-dependent gains a pack owner before UAE work begins.
- Category C keeps working untouched; only its formatting source changes.
- The duplicated EOSB calculation is eliminated.

**Negative**
- Category A and B documents move from instant client-side generation to a server round-trip. Slightly slower; acceptable for documents generated a few times a day.
- The localisation endpoint is new surface area to build and cache.
- Category C components must be audited to confirm they hold no hidden country logic beyond formatting.

## Consequences for the CI country-literal lint (Task 7)

The Task 7 lint bans `SAR`, `15%`, `GOSI`, `Nitaqat`, `ZATCA` and similar outside `src/packs/**`. Devin's guard scripts already scan `frontend/src`, so this ADR determines the lint policy:

- **Category A and B: no exclusion.** They move into packs, so the lint applies normally. This is the point.
- **Category C: no exclusion either.** After migration they hold no country literals — only values received from the localisation endpoint. If the lint fires on a Category C component, that component has hidden country logic and the lint has done its job.
- **Interim, until migration completes:** a single time-boxed allowlist file listing the specific paths awaiting migration, with a tracked issue and an expiry date. Not a blanket `frontend/**` exclusion — a blanket exclusion permanently blinds the guard to the half of the codebase users actually see.

## Sequencing

This migration is **a separate task, not part of Task 5.** Task 5 is a pure refactor with a byte-identical acceptance bar; moving generation from browser to server is a behaviour change and would destroy that bar.

Insert as **Task 8b**, after the regulatory research (Task 8) and before the UAE pack (Task 9). UAE cannot have correct HR letters or contracts until Category A and B have a pack home.

## Revisit Triggers

- A Category C document turns out to need genuinely jurisdiction-specific structure, not just formatting.
- A regulator requires a filing format that cannot be produced server-side.
