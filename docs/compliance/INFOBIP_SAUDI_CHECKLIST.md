# Infobip Saudi Regulatory Checklist

This checklist tracks the actions only the EduSaga 360 account owner (or a person with legal signatory power) can perform before live production messaging through Infobip in Saudi Arabia.

## Alpha / Sandbox (can start immediately)

- [x] Retrieve Infobip API key and base URL from the portal.
- [x] Configure `INFOBIP_API_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_SENDER_EMAIL`, `INFOBIP_SMS_SENDER`, and `INFOBIP_WHATSAPP_SENDER` in the backend environment.
- [ ] Add a small allowlist of test phone numbers and email addresses for sandbox sends.
- [ ] Verify WhatsApp sandbox sender `447860099299` works for a test message.
- [ ] Verify transactional email sends from `noreply@edusaga360.com` (or a verified domain).

## SMS

- [ ] Register alphanumeric Sender ID(s) with CST (formerly CITC).
  - Required documents: CR certificate, signed Letter of Authorization in Arabic.
  - Lead time: ~2 weeks.
  - Transactional sender must be separate from promotional sender.
  - Promotional Sender IDs in KSA must carry the `-AD` suffix.
- [ ] Update `INFOBIP_SMS_SENDER` in Railway to the CST-registered transactional sender once approved.

## WhatsApp Business

- [ ] Complete Meta Business Verification for the EduSaga 360 business.
- [ ] Submit and approve each WhatsApp message template per language.
- [ ] Replace sandbox sender `447860099299` with the approved EduSaga WhatsApp business number.

## Email

- [ ] Verify the sending domain `edusaga360.com` in Infobip (DKIM/SPF).
- [ ] Use a dedicated transactional subdomain (e.g., `noreply@edusaga360.com`) separate from marketing sends.

## PDPL / Consent

- [ ] Capture guardian consent per channel (SMS, WhatsApp, Email) with timestamp and purpose.
- [ ] Honor opt-outs immediately; sync to both EduSaga consent store and Infobip Blocklist.
- [ ] Document retention and deletion policy; propagate EduSaga deletions to Infobip People if People sync is enabled.

## Do Not Disturb / Blocklist

- [ ] Implement and test opt-out keywords: `إيقاف`, `STOP`, `UNSUBSCRIBE`.
- [ ] Subscribe Infobip delivery/failure events to the EduSaga webhook surface.

## Pre-production sign-off

- [ ] Confirm all live Sender IDs and templates are approved.
- [ ] Confirm cost ledger and budget alerts are configured.
- [ ] Confirm YAMEN sequence test completed end-to-end with a sandbox number.
