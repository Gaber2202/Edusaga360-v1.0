# QA Regulatory Pack — State of Qatar

*Research for the Qatar country pack. No code. All items cite a primary source and a retrieval date. Items marked UNVERIFIED are gaps that must be closed with a local accountant, lawyer, or regulator before building against them.*

**Retrieval date for all sources:** 2026-08-06

**Addendum:** `REGULATORY_PACK_ADDENDUM_gap_closure.md` documents why several Qatar items cannot be closed from public sources.

## UNVERIFIED — requires human confirmation

1. **VAT regime.** Qatar has not implemented VAT. The GTA confirms this. This is a verified fact, not a missing value; the pack will return `vat_applicable = false` and zero-rate tax.
2. **E-invoicing details.** A draft e-invoicing law was approved by the Council of Ministers on 6 May 2026 but has not been enacted. No official format, schema, clearance model, phase dates, or penalties have been published. The “1 January 2027” phased start date found in advisory newsletters is not a government announcement.
3. **School fee-increase cap for 2026/27 and beyond.** Law 23/2015 requires MOEHE approval for any fee schedule and any increase. The 2026 School Fees Policy introduces an 18-month notice period and caps tied to performance, but the exact numeric cap and the precise calculation methodology have not been published in the sources retrieved.
4. **Academic calendar exact dates.** MOEHE has approved the 2025–2028 academic calendar, but only the mid-year break timing (last third of December) and Ramadan days off are described publicly. The first/last day of term, winter/spring break dates, and minimum school days for 2025/26 were not retrieved.
5. **WPS applicability and SIF version.** WPS is mandatory for most companies, but whether all private K-12 schools must participate, and the current SIF file version accepted by QCB/MoL, was not confirmed by an official QCB specification. The file layout retrieved is from a commercial bank guide (CBQ).
6. **Student/parent data residency.** Law 13/2016 does not impose a blanket data-localisation requirement, but cross-border flows and special-category data (including children) are regulated. Whether a school must host student/parent personal data inside Qatar has not been confirmed.
7. **Qatarisation quotas.** Law 12/2024 creates a framework to employ, train and onboard Qataris, but no sector-specific numeric quota for private schools has been published in the retrieved sources.

---

## 1. TAX

### 1.1 VAT / consumption tax

- Qatar has **not** implemented Value Added Tax (VAT). The General Tax Authority (GTA) states: “Qatar has not applied the Value Added Tax (VAT).”
- GCC VAT framework agreement (2015) exists, but Qatar has not enacted domestic VAT legislation.
- **Source:** General Tax Authority, *Investors Guide* (https://www.gta.gov.qa/en/investors-guide) and *Taxes Info* page (https://www.gta.gov.qa/en/taxes-info), both under “Value Added Tax (VAT) in Qatar”.
- **Confidence:** High.
- **Local confirmation needed:** Whether any VAT/TRA draft is close to enactment and whether the school would be a taxable person if VAT were introduced.

### 1.2 Corporate income tax

- Qatar imposes income tax on the taxable income of a taxpayer arising from sources in Qatar.
- **Tax rate:** 10% of taxable income, with exceptions for petroleum and certain government agreements.
- **Withholding tax:** A final 5% withholding tax may apply to royalties, interest, commissions and payments for services performed wholly or partly in Qatar that are paid to non-residents without a permanent establishment in Qatar.
- **Source:** General Tax Authority, *Income Tax Law* (English, 2024) (https://www.gta.gov.qa/assets/pdf/Income%20Tax%20Law%20EN%202024.pdf), Article 9 and Article 2.
- **Confidence:** High for the law; Medium for whether a specific private school is structured as a taxable for-profit entity.
- **Local confirmation needed:** Whether the school operator is a taxable “Qatari project” and which income is Qatar-sourced; also whether any education exemption applies.

---

## 2. E-INVOICING

### 2.1 Regime status

- **No e-invoicing regime is currently in force** in Qatar.
- On 6 May 2026, Qatar’s Council of Ministers approved a **draft law** on e-invoicing and its executive regulations, prepared by the Ministry of Finance in coordination with the General Tax Authority (GTA).
- The draft establishes a legal framework for issuing electronic invoices and credit notes; it must still proceed through the legislative process (Shura Council, Amir) before enactment.
- **Source:** Qatar News Agency, *Cabinet holds regular meeting* (https://qna.org.qa/en/news/news-details?date=6%2F05%2F2026&id=cabinet-holds-regular-meeting); The Peninsula Qatar (QNA), *Cabinet holds regular meeting, considers draft law on drones* (https://thepeninsulaqatar.com/article/06/05/2026/cabinet-holds-regular-meeting-considers-draft-law-on-drones).
- **Confidence:** High for draft approval; Low for any implementation detail.

### 2.2 Format, phases and clearance

- **UNVERIFIED — REQUIRES HUMAN CONFIRMATION.** No official format, schema, clearance/reporting model, or phase dates have been published. Advisory sources anticipate a phased rollout possibly beginning 1 January 2027, larger businesses first, but this is not a government announcement.
- **Source:** EY Tax Alert (https://www.ey.com/en_gl/technical/tax-alerts/qatar-approves-draft-e-invoicing-law-and-implementing-regulations) and KPMG Tax Newsflash (https://kpmg.com/us/en/taxnewsflash/news/2026/05/qatar-cabinet-approves-draft-law-e-invoicing-executive-regulations.html) — both advisory/newsletters, not primary law.
- **Confidence:** Low for technical details.
- **Local confirmation needed:** Wait for the enacted law and GTA implementing guidelines before designing invoice generation/clearance.

---

## 3. EDUCATION REGULATOR

### 3.1 Regulator and legal basis

- Private schools are regulated by the **Ministry of Education and Higher Education (MOEHE)** under **Law No. 23 of 2015 on the Regulation of Private Schools**.
- The law requires a licence for any private school; operating without a licence can result in imprisonment of up to two years and/or a fine of up to QAR 100,000.
- The law also governs curriculum, textbooks, admissions age requirements, building signage, donations/grants, and fee schedules.
- **Source:** MOEHE, *Private school licenses* (https://moewebprod.edu.gov.qa/en/Content/Privateschoollicenses); Gulf Times, *Emir issues new law on regulation of private schools* (https://www.gulf-times.com/story/462966/emir-issues-new-law-on-regulation-of-private-schools) reporting Law No. 23 of 2015.
- **Confidence:** High.

### 3.2 Reporting and fee approvals

- Schools must submit a list of all school fees and expenses to the Ministry for approval before they are charged.
- No fee or expense may be increased without Ministry approval, in accordance with controls issued by the Minister.
- The school must refund any amount collected under a name not included in the approved fee schedule.
- **Source:** Al Meezan/Qatari legal portal, Law No. 23/2015 (unofficial English/Arabic excerpt) (https://encyclop.sjc.gov.qa/lawlib/Images/criminal/laws/23-2015/1.htm); MOEHE Sharek service, *Increase Tuition and Additional Fees* (https://www.sharek.gov.qa/en/categories/ministry-of-education-and-higher-education/67739ed94dd1c350422c60bf).
- **Confidence:** High for the approval requirement; Medium for the exact format and frequency of reports.

---

## 4. SCHOOL FEES

### 4.1 Approval and caps

- Law 23/2015: private schools must obtain MOEHE approval for their fee schedule and for any increase.
- In 2026 MOEHE launched the first edition of the **School Fees Policy 2026**, to be implemented from the **2027/2028 academic year** after a pilot during 2026/2027.
- Key features of the new policy:
  - An **18-month notice period** before any approved tuition increase takes effect.
  - A cap on tuition increases based on financial, academic and operational performance.
  - Fees classified as tuition, operating, service and optional fees.
- **Source:** The Peninsula Qatar, *MOEHE launches new policy regulating private school fees starting from 2027-2028 academic year* (https://thepeninsulaqatar.com/article/18/06/2026/moehe-launches-new-policy-regulating-private-school-fees-starting-from-2027-2028-academic-year); Gulf Times, *Qatar launches School Fees Policy 2026* (https://www.gulf-times.com/article/727332/qatar/private-school-fees-linked-to-performance); MOEHE Sharek service (https://www.sharek.gov.qa/en/categories/ministry-of-education-and-higher-education/67739ed94dd1c350422c60bf).
- **Confidence:** High for the framework; Low for the exact numeric cap (see UNVERIFIED #3).

### 4.2 Instalments and fee components

- The 2026 policy is reported to reduce instalments and cap some components, but exact numbers were not located.
- **Source:** The Peninsula Qatar, *Qatar launches School Fees Policy 2026, mandates 18-month notice period before fee hike* (https://thepeninsulaqatar.com/article/11/06/2026/qatar-launches-school-fees-policy-2026-mandates-18-month-notice-period-before-fee-hike).
- **Confidence:** Low for numeric instalment/component caps.
- **Local confirmation needed:** Obtain the actual policy document and the school’s approved fee schedule from MOEHE.

---

## 5. PAYROLL AND HR

### 5.1 Governing law

- **Law No. 14 of 2004 on the promulgation of the Labour Law** governs private-sector employment.
- **Source:** UNODC/Al Meezan, *Law No. 14 of 2004* (PDF) (https://www.unodc.org/cld/uploads/res/law-no--14-of-2004-on-the-promulgation-of-labour-law_html/Law_No._14_of_2004_on_the_promulgation_of_Labour_Law.pdf).
- **Confidence:** High.

### 5.2 Working hours and overtime

- Maximum ordinary working hours: **48 hours per week, 8 hours per day**.
- During Ramadan: **36 hours per week, 6 hours per day**.
- Working hours must include one or more intervals for prayer, rest and meals of not less than 1 hour and not more than 3 hours; intervals are not counted as working hours.
- Workers may work additional hours up to **10 hours per day**, except where continuation is necessary to prevent gross loss or dangerous accident.
- Overtime pay: **basic wage + not less than 25%** for additional hours; **basic wage + not less than 50%** for work between 9 pm and 6 am (shift workers excluded).
- **Source:** Law No. 14/2004, Articles 72, 73, 74.
- **Confidence:** High.

### 5.3 Weekly rest

- The worker is entitled to a **paid weekly rest of not less than 24 consecutive hours**.
- **Friday** is the usual weekly rest day for all workers except shift workers.
- Work on the weekly rest day must be compensated by another rest day and paid at the basic wage plus **not less than 150%**.
- A worker may not be employed for **two consecutive Fridays** (except shift workers).
- **Source:** Law No. 14/2004, Article 75.
- **Confidence:** High.

### 5.4 Annual leave

- A worker who completes one continuous year is entitled to annual leave of:
  - **not less than 3 weeks** for employment of less than 5 years.
  - **not less than 4 weeks** for employment of 5 years or more.
- Proportional leave for fractions of a year.
- Annual leave may be divided with the worker’s consent, but not into more than two periods.
- Up to half of the leave may be postponed to the following year at the worker’s written request.
- **Source:** Law No. 14/2004, Article 79 and 80.
- **Confidence:** High.

### 5.5 Sick leave

- Sick leave with pay is granted after 3 months of service, upon proof by a medical report.
- The worker receives **full remuneration for the first 2 weeks**.
- If the sick leave continues, the worker receives **half remuneration for the next 4 weeks**.
- Any further extension is **without remuneration** until the worker resumes work, resigns or is terminated for health reasons.
- **Source:** Law No. 14/2004, Article 82.
- **Confidence:** High.

### 5.6 Maternity leave

- A female worker who has completed one year of service is entitled to **maternity leave with full remuneration for 50 days**, including prenatal and postnatal periods, provided the postnatal period is not less than 35 days.
- A medical report stating the expected delivery date is required.
- If the remaining leave after delivery is less than 30 days, the difference may be taken from annual leave; otherwise it is unpaid.
- If the worker’s health does not allow return after maternity leave, she may be entitled to additional unpaid leave with a medical certificate.
- Nursing: one hour daily for one year after maternity leave, counted as working time and without reduction in remuneration.
- **Source:** Law No. 14/2004, Article 96 and 97.
- **Confidence:** High.

### 5.7 End of service gratuity

- An employer must pay end-of-service gratuity to a worker who has completed one year or more of continuous service.
- The gratuity is agreed by the parties but may not be less than **3 weeks’ remuneration for every year of employment**.
- The worker is entitled to gratuity for fractions of a year in proportion to service.
- The **last basic wage** is the basis of calculation.
- The employer may deduct amounts owed by the worker from the gratuity.
- **Source:** Law No. 14/2004, Article 54 and 72 (remuneration basis).
- **Confidence:** High.

### 5.8 Qatarisation (nationalisation)

- **Law No. 12 of 2024 on the Qatarisation of Jobs in the Private Sector** came into force in April 2025.
- It obligates entities subject to the law to **employ, train and onboard Qatari job seekers**; if no Qatari is available, priority goes to **children of Qatari women**.
- The Ministry of Labour will develop policies, plans and programmes for implementation and may classify entities by size, workforce and job types.
- Entities covered include private establishments registered in the commercial register, commercial companies (state-owned, state-participated or privately owned), private non-profit institutions, sports institutions and associations.
- **Source:** The Peninsula Qatar (QNA), *Amir issues law on localising private sector jobs, MoL to develop plan* (https://thepeninsulaqatar.com/article/02/09/2024/amir-issues-law-on-localising-private-sector-jobs-mol-to-develop-plan); Lexis Middle East, *Qatar Law No. 12/2024* (https://www.lexismiddleeast.com/law/Qatar/Law_12_2024/en).
- **Confidence:** High for the framework; Low for any numeric quota for schools (see UNVERIFIED #7).

### 5.9 Wages Protection System (WPS)

- WPS is mandatory for all companies except government entities, embassies and petroleum companies.
- Salaries must be transferred to all employees via banks.
- The employer submits a **Salary Information File (SIF)** in CSV format.
- The SIF contains a two-line header and detail records starting from the fourth line. Header fields include employer EID, file creation date/time, payer EID or QID, payer bank short name, payer IBAN, salary year/month, total salaries, number of records and SIF version.
- Detail fields include record serial, QID or visa number, worker name, worker bank/IBAN, payment frequency, number of working days, net salary, basic salary, allowances, deductions, deduction reason code, etc.
- **Source:** Qatar National Bank, *Wages Protection System* (https://www.qnb.com/sites/qnb/qnbqatar/page/en/enwps.html); Commercial Bank of Qatar, *Wage Protection System — File Format Specifications* (https://cbq.com.qa/-/media/project/cbq/cbqwebsite/documents/wps-file-format.pdf).
- **Confidence:** High for the obligation; Medium for the precise file version accepted by the school’s bank (see UNVERIFIED #5).

---

## 6. IDENTITY

### 6.1 National digital identity

- **Tawtheeq** is Qatar’s National Authentication System. It is described as “your unified pass to all governmental online services.”
- The CRA e-Spectrum portal is integrated with Tawtheeq. Users authenticate with either Email/Password or Smart Card.
- Tawtheeq supports Qatari citizens/residents (identified by QID) and visitors/business representatives.
- **Source:** Communications Regulatory Authority (CRA), *User Registration and e-Spectrum Profiles Management* guide (https://e-spectrum.cra.gov.qa/cra/license_guidelines/User_Registration_Guide.pdf); CRA press release, *CRA Launches a New Version of “Arsel” Mobile App* (https://www.cra.gov.qa/en/press-releases/cra-launches-a-new-version-of-arsel-mobile-app).
- **Confidence:** High for the existence and use case.
- **Local confirmation needed:** OAuth/SAML integration endpoints, production onboarding, and whether a private school can use Tawtheeq as a relying party for parent/student authentication.

---

## 7. PAYMENTS

### 7.1 Regulator and payment systems

- Payment services are regulated by the **Qatar Central Bank (QCB)**.
- Qatar’s retail payment systems include:
  - **ECC** (Electronic Cheque Clearing System)
  - **NAPS** (National Network System for ATMs and POS)
  - **QMP** (Qatar Mobile Payment)
  - **Tahweel** (fund transfers between bank accounts)
  - **QPAY** (electronic payment gateway for e-commerce)
  - **WPS** (Wage Protection System)
  - **Fawran** (instant payment system, launched 2024)
- **Source:** QCB, *Retail Payment Systems* (https://www.qcb.gov.qa/en/Pages/Retail-payment-systems.aspx).
- **Confidence:** High.

### 7.2 Providers and school-fee collection

- Schools should contract with a **QCB-licensed bank or payment service provider**.
- Examples of operational channels:
  - **QIB** offers a *School Fees Payment* service through its mobile app, allowing guardians to select the school, enter the student ID, choose the fee type and pay from an account or credit card.
  - **QMP** is an instant national mobile-payment switch connecting licensed mobile payment providers; as of the QCB page, participants include Qatar National Bank, Commercial Bank, Doha Bank, Qatar Islamic Bank, Qatar International Islamic Bank, Al Rayan Bank, Dukhan Bank, **ipay** and **Ooredoo Money**.
- **Source:** QCB, *Retail Payment Systems* and *Qatar Mobile Payment* (https://www.qcb.gov.qa/en/Pages/QatarMobilePayment.aspx); Qatar Islamic Bank, *School Fees Payment* (https://www.qib.com.qa/en/personal/ways-to-bank/services/school-fees-payment).
- **Confidence:** High for the systems; Medium for the full list of school-fee gateways, because a public QCB register of all licensed payment service providers was not retrieved.
- **Local confirmation needed:** Which bank/PSP the school has a merchant account with, settlement terms, and fee-interchange rates.

---

## 8. CALENDAR

### 8.1 Work week and weekend

- **Working days:** Sunday to Thursday.
- **Weekly rest days:** Friday and Saturday.
- **Source:** Qatar Tribune, *Labour ministry declares National Sport Day an official holiday* citing **Amiri Decision No. 57 of 2025** (https://www.qatar-tribune.com/article/218630/latest-news/labour-ministry-declares-national-sport-day-an-official-holiday); GCC Board Directors Institute summary of Amiri Decision No. 57/2025 (https://gccbdi.org/legal-updates/state-qatarqatar-financial-centre-2025-roundup-what-employers-need-know-qatar).
- **Confidence:** High.

### 8.2 School year

- MOEHE approved a new academic calendar for **2025–2026, 2026–2027 and 2027–2028**.
- The calendar takes into account public/private school holiday alignment.
- The mid-year break is fixed in the **last third of December**.
- The calendar provides **two additional days off for students and school staff during Ramadan** in 2025/26 and 2027/28.
- The academic calendar also includes a “Test Day, Rest Day” system for high-school certificate students and a long weekend after mid-second-semester exams.
- **Source:** Qatar News Agency, *MOEHE Approves New Academic Calendar for 2025–2028* (https://qna.org.qa/en/news/news-details?date=8%2F07%2F2025&id=moehe-approves-new-academic-calendar-for-20252028).
- **Confidence:** High for the general structure; Low for exact 2025/26 start/end dates (see UNVERIFIED #4).

### 8.3 Public holidays (2026)

Based on Amiri Decision No. 57 of 2025 and official announcements:

- **National Sports Day:** second Tuesday of February; in 2026 this is **10 February 2026**.
- **Eid Al Fitr:** 17–23 March 2026 for government entities (employees resume 24 March 2026). Private sector dates may be shorter and depend on moon sighting.
- **Eid Al Adha:** 26–30 May 2026 (Dhu Al-Hijjah 9–13, 1447 AH); employees resume 31 May 2026.
- **Qatar National Day:** **18 December** each year.
- If a single working day falls between two holidays, it is included in the holiday.
- **Source:** Qatar Tribune on National Sports Day (https://www.qatar-tribune.com/article/218416/latest-news/amiri-diwan-announces-holiday-for-national-sport-day); QCB announcement on National Sport Day 2026 (https://thepeninsulaqatar.com/article/09/02/2026/qcb-announces-national-sport-day-holiday-for-financial-institutions); QNA on Eid Al Fitr 2026 (https://qna.org.qa/en/news/news-details?date=15%2F03%2F2026&id=amiri-diwan-announces-eid-al-fitr-holiday); Qatar Tribune / The Peninsula on Eid Al Adha 2026 (https://www.qatar-tribune.com/article/235898/latest-news/amiri-diwan-announces-eid-al-adha-holiday; https://thepeninsulaqatar.com/article/24/05/2026/amiri-diwan-announces-holiday-for-eid-al-adha); GCC BDI summary of Amiri Decision 57/2025.
- **Confidence:** High for the legal framework; Medium for exact Gregorian dates of Eid Al Fitr because they depend on moon sighting.

---

## 9. DATA PROTECTION

### 9.1 Applicable law

- **Law No. 13 of 2016 Concerning Privacy and Protection of Personal Data** is the general data protection law.
- It applies to personal data processed electronically, or obtained/collected/extracted in preparation for electronic processing, or processed by a combination of electronic and traditional means.
- **Source:** Cyber Policy Portal, *Law No.13 of 2016 Personal Data Privacy Protection* (PDF) (https://database.cyberpolicyportal.org/api/files/1676833786171f3yskpqxl38.pdf); ILO NATLEX metadata (https://natlex.ilo.org/dyn/natlex2/r/natlex/fe/details?p3_isn=105417).
- **Confidence:** High.

### 9.2 Definitions and special-category data

- **Personal data:** data relating to an identifiable natural person.
- **Special-nature personal data:** data relating to ethnic origin, children, health/physical or psychological condition, religious beliefs, marital relations and criminal offences. The Minister may add further categories.
- **Special-nature data** may only be processed after obtaining a permit from the competent department, under procedures and controls determined by a ministerial decision.
- **Source:** Law No. 13/2016, Article 16 (unofficial English translation in Cyber Policy Portal PDF); ILO NATLEX summary.
- **Confidence:** High.

### 9.3 Consent and children

- Personal data may not be processed without the data subject’s consent, unless processing is necessary for a legitimate purpose of the controller or recipient.
- The owner/operator of a website directed at children must:
  - publish a notice on the nature of children’s data and how it is used;
  - obtain explicit consent from the child’s guardian before processing the child’s personal data;
  - provide the guardian, upon request and identity verification, with a description of the personal data processed.
- **Source:** Law No. 13/2016, Articles 4 and 17 (Cyber Policy Portal PDF).
- **Confidence:** High for the statutory text; Medium for how MOEHE/QCB may apply it to a school platform.

### 9.4 Cross-border data flows and data residency

- **Cross-border data flow** is defined as accessing, viewing, retrieving, using or storing personal data without regard to state borders.
- The controller may not take any decision or measure that limits cross-border data flow, unless the processing breaches the law or would cause serious harm to personal data or individual privacy.
- The law does **not** impose a blanket data-localisation requirement; cross-border flows are permitted subject to the safeguards above.
- **Source:** Law No. 13/2016, Article 15 (Cyber Policy Portal PDF).
- **Confidence:** High for the legal text; Medium for whether a school’s cloud-hosting arrangement requires prior notification or approval (see UNVERIFIED #6).

### 9.5 What a local lawyer should confirm

- Whether the school is a “controller” or “processor” of student/parent personal data.
- Whether hosting student/parent data outside Qatar requires prior consent, notification or additional contractual/technical measures.
- Whether a Data Protection Officer, data-protection impact assessment, or guardian-consent workflow is required.

---

## 10. SUMMARY CONFIDENCE TABLE

| Area | Confidence | Main open item |
|------|------------|----------------|
| VAT | High (not in force) | N/A; no VAT yet |
| Corporate income tax | High law, Medium application | Whether the school entity is taxable |
| E-invoicing | High (not in force); Low details | Wait for enacted law and GTA specs |
| Education regulator | High | Exact reporting format/frequency |
| School fees | High framework; Low numeric cap | Exact cap and instalment rules in 2026 policy |
| Labour law (hours/leave/EOS) | High | Whether senior/shift categories apply |
| Qatarisation | High framework; Low quota | Numeric quota for schools not published |
| WPS | High obligation; Medium file version | Bank-specific SIF version |
| Identity (Tawtheeq) | High existence; Medium integration | Production API onboarding for schools |
| Payments | High systems; Medium provider list | Specific gateway contract |
| Calendar | High work week; Medium exact term dates | Exact 2025/26 school start/end dates |
| Public holidays 2026 | High framework; Medium Eid dates | Moon-sighting adjustments |
| Data protection | High law; Medium operational | Cross-border hosting approval for schools |
