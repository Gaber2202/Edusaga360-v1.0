# REGULATORY PACK ADDENDUM — GAP CLOSURE
## Supplements `AE_REGULATORY_PACK.md` and `QA_REGULATORY_PACK.md`

**Retrieval date:** 2026-08-06
**Purpose:** close the UNVERIFIED items from Task 8 where public primary and reputable secondary sources permit it, and state plainly which items cannot be closed and why.

---

## PART 1 — THE FINDING THAT CHANGES TASK 9

**A K-12 school invoicing parents is a B2C transaction. B2C is excluded from the UAE e-invoicing mandate.**

<cite index="25-1">The mandate covers B2B and B2G transactions; B2C transactions are excluded for now, with the Ministry of Finance signalling that consumer transactions will be addressed at a later stage.</cite> <cite index="28-1">Article 4 of Ministerial Decision 243 of 2025 also carves out sovereign government activities, certain international airline transport services, and certain exempt financial services.</cite>

Three consequences for the UAE pack:

1. **Core tuition invoicing needs no e-invoicing adapter at launch.** Parent invoices are B2C. Only genuinely B2B billing — corporate-sponsored tuition, employer-paid fees, vendor invoices issued by the school — falls in scope.
2. **When it is needed, it cannot be built like ZATCA.** <cite index="24-1">The UAE operates a decentralised reporting and structured-exchange model rather than a clearance model: invoices do not require FTA approval before issue.</cite> <cite index="25-1">All in-scope businesses must appoint a Ministry of Finance–accredited Service Provider to issue, receive and report e-invoices.</cite> There is no self-issued QR code and no self-signed hash chain. The Saudi mental model does not transfer at all.
3. **The ASP is a commercial contract, not code.** No amount of engineering substitutes for appointing an accredited provider.

**Recommendation:** in `packs/ae`, implement `EInvoiceService` as an explicit `NotImplementedInJurisdiction` stub with `jurisdiction_features.einvoicing = false`, and record the reason. Revisit when a UAE customer has genuine B2B billing or when B2C is brought into scope.

---

## PART 2 — GAPS NOW CLOSED

### AE-2. E-invoice format and schema — CLOSED

<cite index="25-1">PINT AE (Peppol International Invoice — UAE) is the structured XML format mandated by the UAE, built on the Peppol PINT specification and the UBL standard with UAE-specific extensions.</cite> <cite index="24-1">On 23 February 2026 the FTA issued a technical document setting out the complete semantic model for UAE e-invoices: 51 mandatory fields covering invoice details, seller and buyer identification, document totals, tax breakdowns and line-level data, aligned to the national PINT AE specification.</cite> <cite index="25-1">The Ministry of Finance published Electronic Invoicing Guidelines V1.0 in February 2026 and Version 1.1 on 1 June 2026, clarifying advance payments, retention billing, free zones and intra-group transactions.</cite>

### AE-3. B2C scope — CLOSED

Excluded. See Part 1. No date has been fixed for inclusion.

### AE-1. TRN / participant identifier — CLOSED FOR OUR PURPOSES

<cite index="24-1">A business's Tax Identification Number — the first 10 digits of its Corporate Tax Registration Number — is the core participant identifier for e-invoicing purposes.</cite>

The internal breakdown of the 15-digit TRN remains unpublished. **This does not block anything.** The pack needs format validation only, not semantic decomposition. Validate as 15 digits; do not attempt to parse meaning from the digits.

### AE — Implementation timeline — CLOSED

<cite index="29-1">Large businesses with annual revenue at or above AED 50,000,000 must appoint an Accredited Service Provider by 30 October 2026, extended from 31 July 2026 by amendments to Ministerial Decision No. 244 of 2025 announced on 10 May 2026; smaller businesses and government entities by 31 March 2027.</cite> <cite index="29-1">Mandatory e-invoicing via the Peppol network in PINT AE format applies to large businesses from 1 January 2027, smaller businesses from 1 July 2027, and government entities from 1 October 2027.</cite> <cite index="26-1">Intra-group transactions within a VAT group are exempt until 1 January 2029.</cite>

**Relevance:** most single-site private schools sit below AED 50m revenue, placing them in the 1 July 2027 wave — and only for B2B billing.

### AE-5. Data residency — PARTIALLY CLOSED

<cite index="30-1">The system requires taxpayers to issue invoices and credit notes electronically through accredited service providers, and to store electronic records within the UAE.</cite>

That is a concrete in-country storage requirement for **e-invoice records**. It does not resolve the broader question of student and parent personal data, which still needs a local lawyer. It does mean the region-routing design deferred in Jurisdiction Layer Phase 6 becomes relevant sooner than assumed.

### AE-6. Abu Dhabi fee caps — MECHANISM CLOSED, CURRENT NUMBER OPEN

<cite index="33-1">Under ADEK policy, schools may increase fees according to their Irtiqaa inspection rating in conjunction with the Education Cost Index.</cite> The most recent published tier structure, for 2023-24: <cite index="31-1">'Outstanding' schools were capped at 3.94%, 'Very good' at 3.38%, 'Good' at 2.81%, and 'Acceptable', 'Weak' and 'Very weak' at 2.25%.</cite>

Also captured: <cite index="31-1">registration fees are capped at 5%; a fee-increase application requires a valid licence at the start of the academic year, a minimum of three years of operation, financial audit reports for the past two academic years submitted through the licensing system, and submission within ADEK's designated window.</cite> <cite index="33-1">Exceptional increases additionally require demonstrated financial losses over two years, audited statements, and an occupancy rate of at least 80%, and are limited to one per academic year.</cite> <cite index="37-1">Abu Dhabi fee-increase requests are submitted each January.</cite>

**Model the mechanism — rating tier × ECI — and hold the numeric caps as effective-dated config rows. The 2026-27 figures require ADEK directly.**

### AE — Dubai fee position — CONFIRMED

Dubai has frozen fees for 2026-27, consistent with the earlier finding. `FeeGovernancePolicy` for a Dubai branch must return "no increase permitted" for that year.

---

## PART 3 — GAPS THAT CANNOT BE CLOSED, AND WHY

These are not research failures. Each is unclosable in principle, commercially gated, or requires a licensed professional. **Attempting to fill them with plausible values is precisely what Task 8's rule forbids.**

| Item | Why it cannot be closed | What the pack does instead |
|---|---|---|
| **QA e-invoicing specs** | The draft law was approved by the Council of Ministers on 6 May 2026 but has not been enacted. No format, schema, clearance model or phase dates exist to find. Advisory-newsletter dates are not government announcements. | `EInvoiceService` stub, `einvoicing = false`. Revisit when enacted. |
| **QA VAT** | Not implemented. There is no rate, threshold or treatment. | `TaxService` returns zero-rate with `vat_applicable = false`. Not a gap — a fact. |
| **WPS SIF layout (AE and QA)** | Bank- and agent-specific. The exact record layout comes from the school's chosen bank under contract. | Build the WPS generator against a configurable layout; populate per customer at onboarding. |
| **UAE Pass onboarding** | Requires a Service Provider application and case-by-case assessment. Not a published parameter. | `IdentityService` stub. Apply only when a UAE customer requires it. |
| **Student/parent data residency** | A legal determination, not a published rate. Needs a UAE and a Qatar lawyer. | Design region routing so it *can* be satisfied; do not assert compliance. |
| **ADEK / SPEA 2026-27 numeric caps** | Published annually by the regulator; the current cycle's figures are not publicly retrievable. | Effective-dated config rows, populated from the regulator when a customer needs them. |
| **QA fee caps, exact term dates, Qatarisation quotas** | Not published in retrievable sources; MOEHE publishes selectively. | Config rows, unpopulated, feature-flagged off. |

---

## PART 4 — WHAT THIS MEANS FOR TASK 9

The architecture already handles unverified parameters correctly, and that was the point of building it this way:

- Regulatory values live in `jurisdiction_tax_rules` and `regulatory_register` as **data with a `source_url` and `verified_on`**, never as constants in code.
- An unverified parameter means the config row stays empty and `jurisdiction_features` stays `false`.
- The capability throws `NotImplementedInJurisdiction` — loudly, per ADR-002 — rather than silently falling back to Saudi behaviour.

So Task 9 is **not blocked** by the open items. `packs/ae` ships with tax, payroll, calendar, localisation and identity-format capabilities live, and e-invoicing, UAE Pass and WPS as explicit stubs.

**One professional call is worth making before a UAE customer signs:** a Dubai accountant or education-sector advisor, to confirm the VAT treatment of tuition, transport, uniforms and activities, and the current ADEK and SPEA fee caps. That is one conversation, and it closes the two commercially significant gaps.
