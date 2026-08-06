# AE Regulatory Pack — United Arab Emirates

*Research for the UAE country pack. No code. All items cite a primary source and a retrieval date. Items marked UNVERIFIED are gaps that must be closed with a local accountant, lawyer, or regulator before building against them.*

**Retrieval date for all sources:** 2026-08-06

**Addendum:** `REGULATORY_PACK_ADDENDUM_gap_closure.md` closes several previously open items; see the notes below and the addendum for details.

## UNVERIFIED — requires human confirmation

1. **WPS SIF file layout.** WPS is mandatory for private-sector employers registered with MOHRE. The exact SIF record layout accepted by the school’s chosen bank/agent is contract-specific and was not confirmed by an official CBUAE specification; only a DIB implementation guide was retrieved. Build the generator against a configurable layout and populate it at onboarding.
2. **Student/parent data residency.** Federal Decree-Law 45/2021 does not impose a blanket data-localization requirement, but cross-border transfers require Data Office approval and an adequacy determination. Whether a school is required to host student/parent personal data inside the UAE is not stated explicitly in the retrieved law text.
3. **ADEK and SPEA 2025/26 numeric fee-increase caps.** ADEK’s mechanism (Irtiqaa rating × ECI, registration fee cap 5%, three-year operating minimum, ≥80% occupancy for exceptional increases, annual January submission) is verified. The exact numeric ECI/cap for the current cycle has not been published in retrievable sources; model it as effective-dated config rows.
4. **UAE Pass onboarding for schools.** UAE Pass is the national identity/authentication system. The exact onboarding process, whether a private school can be approved as a Service Provider, and production credential issuance timelines are described in integration guides as requiring case-by-case assessment.

## CLOSED BY ADDENDUM

- **E-invoice format/schema and B2C scope.** Closed: B2C transactions are excluded from the UAE e-invoicing mandate; the format is Peppol PINT-AE XML through a Ministry of Finance–accredited Service Provider. The pack treats e-invoicing as a stub because the actual integration is a commercial ASP contract, not code.
- **TRN / participant identifier.** Closed for implementation purposes: validate the 15-digit TRN and, if needed, use the first 10 digits as the TIN; do not parse the internal digit structure.
- **Implementation timeline.** Closed: large businesses (revenue ≥ AED 50m) must appoint an ASP by 30 October 2026 and implement by 1 January 2027; smaller businesses by 31 March 2027 / 1 July 2027; government by 31 March 2027 / 1 October 2027.
- **E-invoice record storage.** Partially closed: electronic records must be stored inside the UAE. This applies to e-invoice records; broader student/parent personal data remains under UNVERIFIED #2.

---

## 1. TAX

### 1.1 VAT rate and registration

- **Standard VAT rate:** 5% (Federal Decree-Law No. 8 of 2017 on Value Added Tax, Executive Regulation).
- **Mandatory registration threshold:** Taxable supplies and imports exceeding AED 375,000 over the previous 12 months, or expected to exceed that threshold in the next 30 days.
- **Voluntary registration threshold:** Taxable supplies, imports or taxable expenses exceeding AED 187,500 over the previous 12 months, or expected to exceed that threshold in the next 30 days.
- **Source:** Federal Tax Authority, VAT Registration (https://tax.gov.ae/en/services/vat.registration.aspx) and *Get to know your Tax Obligations* (https://tax.gov.ae/DataFolder/Files/Guides/VAT/Awareness/Get%20to%20know%20your%20Tax%20Obligations.pdf).
- **Confidence:** High.
- **Local confirmation needed:** Whether a specific school has exceeded the threshold in any rolling 12-month window.

### 1.2 VAT treatment of school supplies

The FTA *VAT Education Guide* (VATGED1, June 2026) sets out the treatment for private schools.

**Zero-rated (0%) — must meet all conditions:**

- Educational services supplied by a *Qualifying Educational Institution* (recognised by the federal or local education regulator) under a *Qualifying Curriculum* (recognised by the same regulator).
- Related goods and services supplied by the same institution if directly related to the zero-rated educational service:
  - Printed or digital reading material related to the curriculum.
  - Field trips directly related to the curriculum and not predominantly recreational.
  - Extracurricular activities where no additional fee is charged.
  - Re-registration of already-enrolled students.
  - Support services for students of determination provided under a recognised curriculum.

**Standard-rated (5%):**

- Application/registration fees paid before a student is enrolled.
- Uniforms or any clothing required to be worn.
- Electronic devices.
- Food and beverages (including vending machines and vouchers).
- Field trips that are predominantly recreational.
- Extracurricular activities charged as an additional fee.
- Sale of merchandise to students/alumni/third parties.
- Rental of electronic equipment.
- Replacement access cards.
- Board examination fees are generally standard-rated unless treated as part of a qualifying educational service.

**Exempt:**

- Local passenger transport services in a qualifying means of transport (e.g. a bus) supplied to students.
- Student accommodation may be exempt as a supply of a Residential Building if it meets the conditions; serviced accommodation is standard-rated.

- **Source:** FTA, *VAT Education Guide* (https://tax.gov.ae/Datafolder/Files/Pdf/2026/Guide/VAT%20Education%20Guide%20-%2029%2006%202026-rep.pdf), Articles 40 and 45 of the VAT Executive Regulation cited therein.
- **Confidence:** High for the categories above.
- **Local confirmation needed:** Whether a specific supply is “directly related” to a qualifying educational service or is a separate standard-rated supply; this is fact-specific.

### 1.3 Tax Registration Number (TRN)

- A TRN is a unique number issued by the FTA for each person registered for tax.
- For UAE e-invoicing, the Participant Identifier is the Tax Identification Number (TIN), which is the first 10 digits of the 15-digit TRN.
- **Source:** MOF, *UAE Electronic Invoice Mandatory Fields* (https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoice-mandatory-fields_V-1.0-23Feb2026.pdf) and MOF e-invoicing guidelines.
- **Confidence:** Medium-High for the 15-digit length and TIN length.
- **Addendum closure:** The internal TRN structure is not needed for implementation. Validate 15 digits and use the first 10 as the TIN; do not parse the digits.

---

## 2. E-INVOICING

### 2.1 Regime status

- Electronic invoicing is mandatory for any person conducting business in the UAE, regardless of VAT registration status, unless specifically excluded under Article 4 of Ministerial Decision No. 243 of 2025.
- An electronic invoice is defined as an invoice issued, transmitted and received through the Electronic Invoicing System in a structured electronic format that enables automatic and electronic processing.
- **Source:** MOF, *UAE Electronic Invoicing Guidelines* V1.1 (1 June 2026) (https://mof.gov.ae/wp-content/uploads/2026/06/UAE-Electronic-Invoicing-Guidelines_V-1.1-01June2026.pdf) and FTA, *Ministerial Decision No. 244 of 2025* (https://tax.gov.ae/Datafolder/Files/Legislation/2025/Ministerial%20Decision%20No.%20244%20of%202025%20on%20The%20Implementation%20of%20the%20Electronic%20Invoicing%20System.pdf).
- **Confidence:** High.

### 2.2 Format and clearance

- The required format is XML in a Peppol-based syntax (PINT-AE — Peppol International concept customised for the UAE).
- The guidelines and the *UAE Electronic Invoice Mandatory Fields* document list mandatory fields for a tax invoice and a commercial electronic invoice (XML), including: invoice number, date, type code, currency, transaction type code, payment due date, business process type, specification identifier, payment means, seller/buyer name and identifiers, address lines, tax identifiers, line identifiers, quantities, unit of measure, net amounts, tax breakdown, totals.
- **Source:** MOF, *UAE Electronic Invoice Mandatory Fields* V1.0 (23 Feb 2026) (https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoice-mandatory-fields_V-1.0-23Feb2026.pdf).
- **Confidence:** High for the mandatory-field list and the Peppol PINT-AE framework.
- **Addendum closure:** The exact BIS/schema binding for a specific school ERP is an ASP integration detail; the pack does not self-issue UAE e-invoices.

### 2.3 Implementation phases

- Voluntary implementation: from 1 July 2026.
- Mandatory implementation (per MD 244/2025):
  - Revenue ≥ AED 50,000,000: appoint an Accredited Service Provider (ASP) by 31 July 2026; implement by 1 January 2027.
  - Revenue < AED 50,000,000: appoint ASP by 31 March 2027; implement by 1 July 2027.
  - Government entities: appoint ASP by 31 March 2027; implement by 1 October 2027.
- Business-to-Consumer transactions are not subject to mandatory e-invoicing until a Ministerial decision determines otherwise.
- **Source:** FTA, *Ministerial Decision No. 244 of 2025* (https://tax.gov.ae/Datafolder/Files/Legislation/2025/Ministerial%20Decision%20No.%20244%20of%202025%20on%20The%20Implementation%20of%20the%20Electronic%20Invoicing%20System.pdf).
- **Confidence:** High for the timeline and the B2C exclusion.

---

## 3. EDUCATION REGULATOR

- **Federal level:** The Ministry of Education (MOE) manages registration of private schools in the UAE *except* in Abu Dhabi, Dubai and Sharjah.
- **Abu Dhabi:** Department of Education and Knowledge (ADEK).
- **Dubai:** Knowledge and Human Development Authority (KHDA); Dubai Schools Inspection Bureau (DSIB) carries out inspections.
- **Sharjah:** Sharjah Private Education Authority (SPEA).
- **Ras Al Khaimah:** Ras Al Khaimah Department of Knowledge (RAK DOK) has its own Tuition Fees Policy.
- Schools must be licensed by the relevant emirate-level regulator. The MOE/ADEK/SPEA/RAK DOK policies require fee schedules to be published and approved, and financial statements to be audited and submitted.
- **Source:** UAE Government Portal, *Licensing private educational institutes* (https://u.ae/en/information-and-services/education/licensing-private-educational-institutes); ADEK School Fees Policy; KHDA School Fees Framework; SPEA fee-increase announcement; RAK DOK Tuition Fees Policy.
- **Confidence:** High.
- **Local confirmation needed:** Which regulator and which curriculum-approval body applies to a specific school branch.

---

## 4. SCHOOL FEES

### 4.1 Dubai (KHDA)

- The *School Fees Framework* applies to all private schools that have completed three years of operation and charge tuition fees.
- Covered fees: tuition, and cost of school uniforms and books if supplied by the school.
- Fee increases are tied to:
  - The Education Cost Index (ECI) announced by Digital Dubai Authority.
  - The school’s most recent DSIB inspection rating.
- **ECI for 2024/25:** 2.6%.
- **Multipliers:**
  - Maintain rating: up to 1× ECI.
  - Improve from Very Weak/Weak/Acceptable to next category: up to 2× ECI.
  - Improve from Good to Very Good: up to 1.75× ECI.
  - Improve from Very Good to Outstanding: up to 1.5× ECI.
  - Drop in rating: no increase.
- Not-for-profit schools may request an increase above ECI with board approval and evidence of parental endorsement.
- Academic year calendars are published by KHDA; Dubai has both September-start and April-start schools.
- **Source:** KHDA, *School Fees Framework* (https://web.khda.gov.ae/getattachment/Resources/Forms/FeeFramework-English.pdf.aspx?lang=en-GB); KHDA news on ECI 2.6% (https://web.khda.gov.ae/en/About-Us/News/2024/Education-Cost-Index-set-at-2-6-per-cent-for-2024-25); KHDA academic calendar (https://web.khda.gov.ae/en/Resources/academic-calendar-dubai-private-schools).
- **Confidence:** High.
- **Local confirmation needed:** The ECI for 2025/26; the school’s latest DSIB rating.

### 4.2 Abu Dhabi (ADEK)

- *ADEK School Fees Policy* v1.1 (Sept 2024) applies.
- Fee components must be disclosed: tuition, educational resource, uniform, transport, extracurricular, other.
- Board examination fees may be charged separately.
- Registration fee may not exceed 5% of approved tuition and must be deducted from final tuition.
- Fees must be published on the school website.
- Tuition may be collected in at least 3 and up to 10 instalments.
- Standard increases are based on the Abu Dhabi Education Cost Index (numeric cap not published in the retrieved policy).
- Exceptional increases require: audited losses in the last two academic years, ≥80% occupancy, at least three academic years of operation, valid licence, audited financial statements, and only one exceptional increase per academic year.
- **Source:** ADEK, *School Fees Policy* (https://llm.education/wp-content/uploads/2025/10/ADEK_S_Fees-Policy_EN.pdf); ADEK licensing guide (https://guides.adek.gov.ae/LicensingSystem/tc/10000); UAE Government Portal (https://u.ae/en/information-and-services/education/licensing-private-educational-institutes).
- **Confidence:** High for the framework and the required submission mechanism.
- **Addendum closure:** The numeric ECI/cap is an effective-dated config row populated from the regulator each cycle; the 5% registration cap, three-year operating minimum, ≥80% occupancy rule and annual January submission are verified.

### 4.3 Sharjah (SPEA)

- SPEA approved the following fee-increase caps for the 2023/24 academic year, linked to the Itqan school-performance rating:
  - Excellent: up to 5%
  - Very Good: up to 3.75%
  - Good: up to 2.5%
  - Acceptable: up to 1.25%
  - Below Acceptable: no increase
- The 2025/26 cap has not been retrieved.
- **Source:** SPEA, *Sharjah Private Education Authority Approves 5% Maximum Fees Increase* (https://spea.shj.ae/en/news/sharjah-private-education-authority-approves-5-maximum-fees-increase-for-academic-year-2023-2024/).
- **Confidence:** High for 2023/24; Low for the current year numeric cap.
- **Addendum closure:** SPEA’s numeric cap for 2025/26 has not been retrieved; model as effective-dated config.

### 4.4 Other emirates

- The MOE and/or the relevant emirate-level authority must approve any fee increase.
- **Source:** UAE Government Portal, *Licensing private educational institutes* (https://u.ae/en/information-and-services/education/licensing-private-educational-institutes); ADEK Financial Audits and Reports Policy; RAK DOK Tuition Fees Policy.
- **Confidence:** Medium.

---

## 5. PAYROLL AND HR

### 5.1 Governing law

- Federal Decree-Law No. 33 of 2021 on the Regulation of Employment Relationships, as amended, and Cabinet Resolution on its Executive Regulation.
- **Source:** MOHRE, *Federal Decree-Law No. 33 of 2021* (https://mohre.gov.ae/assets/download/8cd7cf08/Federal%20Decree-Law%20No.%2033%20of%202021%20Regarding%20the%20Regulation%20of%20Employment%20Relationship%20and%20its%20amendments.pdf.aspx).
- **Confidence:** High.

### 5.2 Working hours and overtime

- Normal maximum: 8 hours per day or 48 hours per week.
- During Ramadan: working hours reduced by 2 hours per day.
- Overtime: maximum 2 hours per day; total working hours may not exceed 144 hours every 3 weeks.
- Overtime pay: basic wage for the normal hours plus not less than 25% of that wage; for overtime between 10 pm and 4 am, the increase is not less than 50% (shift workers excluded).
- Work on the weekly rest day (Friday is the usual rest day): compensated by another rest day and paid the basic wage plus not less than 150%.
- **Source:** UAE Government Portal, *Working hours and overtime* (https://www.uaesupremecouncil.org/en/information-and-services/jobs/employment-in-the-private-sector/working-hours.html); MOHRE law PDF, Articles 17 and 19.
- **Confidence:** High.

### 5.3 Leave entitlements

- **Annual leave:** 30 days per year of completed service; 2 days per month if service is between 6 and 12 months; proportional for part-time workers.
- **Sick leave:** up to 90 continuous or intermittent days per year after probation. First 15 days with full pay, next 30 days with half pay, remaining days unpaid. Worker must notify employer within 3 working days and submit a medical report.
- **Maternity leave:** 60 days — first 45 with full wage, next 15 with half wage. May be followed by up to 45 consecutive/intermittent days of unpaid leave if medically certified. If the child has a health condition requiring constant companion, 30 additional days with full pay after maternity leave.
- **Parental leave:** 5 working days for either parent within 6 months of birth.
- **Bereavement leave:** 5 days for death of spouse; 3 days for death of parent, child, sibling, grandchild or grandparent.
- **Source:** MOHRE law PDF, Articles 29, 30, 31; UAE Government Portal; Gulf News/Alsuwaidi & Company summary of Article 31/32.
- **Confidence:** High.

### 5.4 End of service gratuity (foreign workers)

- Foreign worker who completes at least one year of continuous service is entitled to:
  - 21 days’ basic wage for each of the first 5 years.
  - 30 days’ basic wage for each additional year.
- Proportional gratuity for parts of a year.
- Total gratuity may not exceed 2 years’ wage.
- Calculated on the last basic wage.
- Nationals are covered by pensions/social security legislation, not this foreign-worker gratuity.
- **Source:** MOHRE law PDF, Article 51; MOHRE *Awareness Guide for New Employers*.
- **Confidence:** High.

### 5.5 Emiratisation (nationalisation quota)

- Private-sector companies with 50 or more employees must achieve 2% annual growth in Emirati employees in skilled positions.
- The target is split: 1% by 30 June and a further 1% by 31 December.
- Non-compliant companies face a monthly financial contribution.
- **Source:** MOHRE, *Emiratisation targets* (https://mohre.gov.ae/en/guidance-and-awareness-portal-new/emiratisation-targets); WAM, *30 June deadline for achieving Emiratisation targets* (https://www.wam.ae/en/article/c03cqiu-june-deadline-for-achieving-emiratisation-targets); Dentons alert.
- **Confidence:** High.
- **Local confirmation needed:** Whether a specific school falls within a “skilled position” category, and the exact contribution per missing Emirati for the current year.

### 5.6 Wages Protection System (WPS)

- All employers registered with MOHRE must subscribe to WPS and pay wages through it, using CBUAE-authorised banks/financial institutions.
- WPS processes a Salary Information File (SIF) containing SCR (control), EDR (employee detail) and EVP (variable pay) records, in CSV or fixed-length format depending on the bank.
- Late payment: if wages are not paid within 15 days of the due date, the employer is considered late.
- Compliance is generally met if >80% of eligible employees’ wages are transferred.
- **Source:** UAE Government Portal, *How salaries should be paid* (https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/payment-of-wages/how-salaries-should-be-paid); MOHRE, *Wages Protection System* (https://www.mohre.gov.ae/en/guidance-and-awareness-portal-new/wages-protection-system); Ministerial Resolution No. 598 of 2022 (https://mohre.gov.ae/assets/download/c9a61f1a/Ministerial%20Resolution%20No.%20598%20of%202022%20Regarding%20the%20Wages%20Protection%20System%20and%20Its%20Amendment.pdf.aspx); DIB, *SIF Creation Guidelines* (https://www.dib.ae/docs/default-source/wps-guidelines/wps-file-format-reference-guide_v1-1.pdf).
- **Confidence:** High for the obligation; Medium for the precise file format (see UNVERIFIED #4).

---

## 6. IDENTITY

- **UAE Pass** is the national digital identity and authentication system.
- It provides OAuth 2.0 endpoints for staging and production.
- Service Providers must complete onboarding; client credentials are channel/use-case specific and issued after assessment/sign-off by the UAE Pass onboarding team.
- UAE Pass may be linked to MOE profiles.
- **Source:** UAE Pass Developer Documentation, *Web Integration* (https://docs.uaepass.ae/feature-guides/authentication/web-application); UAE Pass *Standard Implementation Guidelines* (https://docs.uaepass.ae/guidelines/use-cases/standard-implementation-guidelines); MOE, *Link MOE & UAE Pass Profile* (https://www.moe.gov.ae/En/Pages/UAEPass/LinkMOEUAEPassProfiles.aspx).
- **Confidence:** High for the existence and protocol; Medium for onboarding specifics (see UNVERIFIED #7).

---

## 7. PAYMENTS

- Payment service providers in the UAE must be licensed by the Central Bank of the UAE (CBUAE). Schools should integrate through a CBUAE-licensed *Retail Payment Services* provider or bank.
- The CBUAE Register (May 2026) lists licensed Retail Payment Services providers including, but not limited to: NymCard, Botim Money, Digital Financial Services, Instant Cash, Network International, The Vaults, Noqodi, Checkout MENA, FIS Worldpay, MyZoi, My Fatoorah, PayFort, EITC Financial Services, Geidea, Magnati, Whizpay, Alfanow, Wise Fintech Network, MBME PAY, IDFAA Payment Services and T T S Financial Services.
- CBUAE retail payment systems include NAPS (ATM/POS network), QPAY/Tahweel, Qatar Mobile Payment (QMP) and Fawran (instant payments) — note these are Qatar systems; for the UAE the relevant systems are the CBUAE-licensed Retail Payment Services and the UAEWPS.
- **Source:** CBUAE, *CB Register May 2026* (https://www.centralbank.ae/media/5smlotxp/cb-register-may-2026.pdf); CBUAE *Retail Payment Services and Card Schemes Regulation* (https://rulebook.centralbank.ae/en/node/1580).
- **Confidence:** High.
- **Local confirmation needed:** Which provider the school has a commercial relationship with and whether it supports the required card/wallet methods and settlement currency (AED).

---

## 8. CALENDAR

### 8.1 Work week and school week

- Federal government: Monday–Thursday full day, Friday half day (7:30 am–12:00 pm), Saturday–Sunday weekend. Effective 1 January 2022.
- Most emirates adopted the same pattern. Sharjah government has a 4-day week (Monday–Thursday) with Friday–Sunday weekend.
- Dubai and Abu Dhabi private schools generally operate Monday–Friday, with Friday ending no later than 12:00 pm (KHDA) or 11:30 am from January 2026 (updated KHDA guidance), and Saturday–Sunday weekend.
- **Source:** UAE Government Portal, *Working hours in the public sector* (https://www.uaesupremecouncil.org/en/information-and-services/jobs/working-in-uae-government-sector/working-hours-in-the-public-sector.html); WAM announcement of 4.5-day week (https://www.wam.ae/en/article/hszrdpi4-uae-government-announces-four-and-half-day-working); Khaleej Times on Dubai school Friday timings (https://www.khaleejtimes.com/uae/education/dubai-private-school-friday-timings).
- **Confidence:** High.

### 8.2 Academic calendar (Dubai KHDA, 2025/26)

**September-start schools:**

- Start of academic year: 25 August 2025
- Winter break starts: 8 December 2025
- Resumption after winter break: 5 January 2026
- Spring break: 16 March 2026
- Resumption after spring break: 30 March 2026
- End of academic year: 3 July 2026
- Minimum school days: 185 days (per KHDA 2026/27 calendar; 2025/26 table did not state a minimum).

**April-start schools:**

- Start of academic year: 7 April 2025
- Summer break starts: 30 June 2025
- Resumption after summer break: 25 August 2025
- Winter break starts: 15 December 2025
- Resumption after winter break: 5 January 2026
- End of academic year: 1–31 March 2026
- Minimum school days: 182 days.

- **Source:** KHDA, *Academic calendar for Dubai's private schools* (https://web.khda.gov.ae/en/Resources/academic-calendar-dubai-private-schools).
- **Confidence:** High for Dubai; Medium for whether a specific school follows the September or April calendar.

### 8.3 Public holidays (2026, federal)

- **Eid Al Fitr:** Thursday 19 March 2026 – Sunday 22 March 2026 (federal government); private sector generally Thursday 19 – Saturday 21, extended to Sunday 22 if Ramadan is 30 days.
- **Eid Al Adha / Arafat Day:** Monday 25 May 2026 – Friday 29 May 2026 (federal government).
- **National Day:** 2 December (or 3 December when combined).
- Islamic dates may shift based on moon sighting.
- **Source:** FAHR Circular on Eid Al Fitr (https://www.fahr.gov.ae/en/news/eid-al-fitr-holiday-in-the-federal-government-from-19-to-22-march-2026/); FAHR on Arafat/Eid Al Adha (https://www.fahr.gov.ae/en/news/the-federal-authority-for-human-resources-announces-the-eid-al-adha-holiday-for-the-federal-government-from-may-25-29-2026/); UAE Government public-holiday guidance.
- **Confidence:** High for federal government; Medium for private-school holidays and moon-sighting adjustments.

---

## 9. DATA PROTECTION

### 9.1 Applicable law

- Federal Decree-Law No. 45 of 2021 Concerning the Protection of Personal Data, in force since 2 January 2022.
- Regulated by the UAE Data Office (established under Federal Decree-Law No. 44 of 2021).
- **Source:** UAE Legislations (https://uaelegislation.gov.ae/en/legislations/1972/).
- **Confidence:** High.

### 9.2 Scope and definitions

- Applies to processing of personal data by automated or partially automated means, and non-automated processing forming part of a filing system, by controllers/processors in the UAE or outside the UAE if processing data of data subjects inside the UAE.
- **Personal data** includes any data relating to an identifiable natural person (name, voice, image, ID number, electronic identifier, geolocation, physical/physiological/economic/cultural/social characteristics). It includes Sensitive Personal Data and Biometric Data.
- **Sensitive personal data** includes data revealing family, ethnic origin, political/philosophical opinions, religious beliefs, criminal record, biometric data, or health/genetic/sexual condition.
- **Source:** UAE Legislations (https://uaelegislation.gov.ae/en/legislations/1972/); web-extracted articles.
- **Confidence:** High.

### 9.3 Cross-border transfer and data residency

- Cross-border transfer of personal data for processing is permitted only where:
  - The destination state/province has legislation addressing personal data protection and a judicial/regulatory authority that can enforce rights; or
  - The UAE has a bilateral/multilateral agreement with the destination; or
  - Alternative safeguards are put in place where no adequate protection exists (Article 23).
- The law does **not** impose a blanket requirement that personal data must be stored physically inside the UAE, but cross-border transfers require Data Office approval and an adequacy assessment.
- **Source:** UAE Legislations, Articles 22 and 23 (https://uaelegislation.gov.ae/en/legislations/1972/); Lexis Middle East summary.
- **Confidence:** High for the legal mechanism; Medium for how the Data Office will classify a school’s student/parent data and which safeguards are acceptable.
- **Addendum partial closure:** E-invoice records must be stored inside the UAE. Broader student/parent personal data residency is still UNVERIFIED #2.

### 9.4 What a local lawyer should confirm

- Whether a K-12 school is a “controller” or “processor” for student/parent data under the law.
- Whether cloud hosting outside the UAE requires a Data Office approval and what contractual/technical safeguards are sufficient.
- Whether the school needs a Data Protection Officer and a data-protection impact assessment.

---

## 10. SUMMARY CONFIDENCE TABLE

| Area | Confidence | Main open item |
|------|------------|----------------|
| VAT treatment of tuition/books/transport | High | Fact-specific “directly related” determination |
| E-invoicing mandate and timeline | High | ASP integration; B2C excluded |
| Education regulators | High | Which regulator governs each branch |
| Dubai school fees | High | 2025/26 ECI and DSIB rating; frozen for 2026-27 |
| Abu Dhabi/SPEA fee caps | High mechanism / open number | Current numeric ECI/cap loaded from regulator config |
| Labour law (hours, leave, EOS) | High | Whether a school is in a special category/free zone |
| WPS | High | Exact SIF layout for the chosen bank/agent |
| UAE Pass | Medium | School onboarding and production credentials |
| Payments | High | Provider selection and settlement terms |
| Calendar | High | Whether school follows September or April calendar |
| Data protection | High | Cross-border transfer approval for school cloud |
