# Government Integrations — What's Built vs Stubbed

> Audience: founder + client. **Deliberately blunt about live vs stub** — over-
> claiming here is the fastest way to lose a government-adjacent client's trust.

## Summary

EduSaga 360 ships **UI and data models** for the major Saudi government service
touchpoints, but the **live API connections are not activated** — they are
**interface/UI stubs**. Activating each requires a signed data-exchange agreement
and API credentials from the relevant authority, which are not held today.

## Status by authority

| Integration | Purpose | Status | Notes |
|-------------|---------|:------:|-------|
| **GOSI** | Social insurance (payroll contributions) | 🟡 UI stub | `GOSIManagement.jsx`, `GOSIServices.jsx`; payroll computes GOSI amounts, but no live GOSI API call. |
| **Qiwa** | Labor contracts / workforce | 🟡 UI stub | `QiwaContracts.jsx`, `QiwaServices.jsx`. |
| **Mudad** | Wage Protection System (WPS) | 🟡 UI stub | `MudadServices.jsx`, `MudadWPS.jsx`; bank-export files exist, no live Mudad submission. |
| **Muqeem** | Expat/iqama services | 🟡 UI stub | `MuqeemServices.jsx`, `IqamaServices.jsx`. |
| **Absher / visas** | Government identity/visa services | 🟡 UI stub | `AbsherServices.jsx`, `VisaServices.jsx`. |
| **Saudization (Nitaqat)** | Saudization tracking | 🟡 UI + local calc | `SaudizationTracker.jsx`; computed locally, not from a live source. |
| **Nafath** | National single-sign-on / identity assurance | ⛔ not built | No Nafath component; identity is Supabase Auth today. Interface-ready via an identity adapter seam. |
| **Noor / Madrasati** | Ministry of Education SIS / LMS | ⛔ not built | No live SIS data exchange; student data is entered/imported into EduSaga. |

## What "activating" one looks like

For each authority the steps are similar:

1. **Agreement** — sign the data-exchange / API agreement with the authority (or
   via an approved aggregator, e.g. for GOSI/Qiwa/Mudad this is often through a
   licensed provider).
2. **Credentials** — obtain API keys / client certificates / a registered
   callback.
3. **Adapter** — implement the authority's API behind a typed interface (the app
   is structured so this is a new adapter module + config, not a rewrite of the
   feature).
4. **Sandbox** — validate against the authority's test environment.
5. **Feature flag** — enable per tenant once live, keeping the stub as fallback.

## Nafath (identity) — readiness

Nafath is the natural identity-assurance upgrade (national-ID-backed login).
Today login is Supabase Auth (email/password, `app_metadata` claims). A Nafath
integration would slot in as an **identity provider adapter** feeding the same
`tenant_id`/`role` claim model — the auth layer already centralises claim
resolution, so this is additive.

## Noor / Madrasati (MoE SIS) — readiness

No live connection. Student/enrolment data is managed inside EduSaga. A future
Noor/Madrasati exchange would be a **SIS adapter** (import/sync students, grades,
attendance) behind a typed interface.

## Honest bottom line for the client

- The **screens exist** and demo well, and the **local logic** (payroll GOSI math,
  Saudization ratios, WPS bank files) is real.
- **No live government API is connected.** Do not represent any of these as
  "integrated with GOSI/Qiwa/Nafath/Noor" — represent them as **"ready to
  integrate, pending agreements + credentials."**
