# Compliance & Integration Guides

Client-facing guides for the EduSaga 360 platform. Each is written to be **honest
about what is live vs. stubbed** — over-claiming compliance is a fast way to lose
a Saudi education client's trust.

| Guide | Covers | Headline status |
|-------|--------|-----------------|
| [ZATCA_PHASE2.md](./ZATCA_PHASE2.md) | E-invoicing (UBL 2.1, ECDSA signing, TLV QR, PIH, clearance/reporting) | Pipeline **built**; needs per-school CSID + sandbox verification. |
| [PDPL.md](./PDPL.md) | Saudi Personal Data Protection Law posture | Strong isolation/encryption; **data residency is in Seoul, not KSA** — key gap. |
| [PAYMENTS.md](./PAYMENTS.md) | Moyasar + wire transfer, mada, settlement, refunds, webhooks | Moyasar **live** (secret + amount verified); Tap/HyperPay not built. |
| [GOVERNMENT_INTEGRATIONS.md](./GOVERNMENT_INTEGRATIONS.md) | GOSI, Qiwa, Mudad/WPS, Muqeem, Absher, Nafath, Noor | **UI/stub only** — no live government API connected. |
| [API_GUIDE.md](./API_GUIDE.md) | Third-party integration: auth, rate limits, examples | JWT auth **live**; no `/v1` or OpenAPI spec yet. |

> These describe the platform as of the 2026-07 production-readiness sprint. Where
> a guide says 🟡 or ⛔, the matching action is tracked in `../../BLOCKERS.md` or
> the 30-day plan in `../READINESS_REPORT.md`.
