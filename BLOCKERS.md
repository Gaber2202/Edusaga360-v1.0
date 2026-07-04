# EduSaga 360 — Blockers

Things this sprint could not complete because they need a credential, an external
sandbox, or a business decision. Each says exactly what is needed to unblock.

---

## PAY-SECRET — Set `MOYASAR_WEBHOOK_SECRET` in production

**What's needed.** Create/confirm the webhook "secret token" in the Moyasar
dashboard and set `MOYASAR_WEBHOOK_SECRET` on the backend service (Railway),
matching value. Until it is set, the subscription webhook logs a warning and
skips authenticity verification (amount is still verified, but a forged
`status:'paid'` with the correct amount would pass). This is a 5-minute config
change and should be done before the client demo.

## PAY-ROUTING — Decide how Moyasar reaches the webhook (PAY-03)

**Context.** `/api/subscription/webhook/moyasar` is mounted behind
`authMiddleware`, so a real Moyasar callback (no JWT) is rejected. Auto-apply
likely does not fire in production today.

**What's needed.** (1) Confirm in the Moyasar dashboard whether a server webhook
is configured and to what URL. (2) Decide: expose the webhook on a public,
unauthenticated path (safe now that PAY-01/PAY-02 guard it, **provided
PAY-SECRET is set**), or keep relying on the redirect-callback + wire-transfer
verify paths. (3) Validate end-to-end against the **Moyasar sandbox** — we have
no sandbox credentials in this environment, so this could not be tested here.

**Suggested change (once decided):** move the webhook handler to a router mounted
without `authMiddleware` (e.g. `/api/webhooks/moyasar`), keep `express.json`, keep
both guards. Add an integration test that posts a sandbox-shaped payload.

## Sandbox credentials — Moyasar / Tap / ZATCA simulation

None are present in this environment, so no live gateway or ZATCA-portal calls
could be exercised. Needed to: run payment E2E in CI, validate ZATCA clearance
vs reporting against the simulation portal, and expand ZATCA golden-file tests
with portal-verified samples.

## Observability — Sentry DSN

`@sentry/react` is a frontend dependency (wired behind env). Backend error
tracking is console-based. To complete observability: provide a Sentry DSN (or
equivalent) and wire the backend SDK behind an env flag.

## Government integrations — agreements + credentials

GOSI, Qiwa, Mudad, Muqeem, Absher, Nafath, Noor/Madrasati are UI/interface stubs.
Activation requires signed data-exchange agreements and API credentials from each
authority. Cannot be built or tested without them; interfaces are ready to back
with a live adapter when credentials exist.

## Dependency majors (DEP-01)

`nodemailer` (backend runtime) and `vite`/`vitest`/`esbuild` (dev/build) advisories
need breaking major upgrades. Needs a regression budget: bump, run full suite +
build, and manually verify the email path (nodemailer) and dev server before
merging. Not force-applied blind this pass.

## DevOps / DR / Load — founder or ops actions (from docs/DEVOPS.md, RUNBOOK.md, LOAD_TEST.md)

These need repo-settings, dashboard, or a staging target — not code:

- **Branch protection** (GitHub repo settings): require PR + passing CI checks +
  no direct push to `main`. Today CI runs on PRs but nothing enforces green before
  merge. (docs/DEVOPS.md)
- **Production approval gate** (DEP-2): add a GitHub `production` Environment with
  required reviewers so prod deploys pause for a human click.
- **Backend deploy wiring** (DEP-1): either wire the Railway deploy step or delete
  the commented-out dead job so the pipeline reflects reality.
- **Separate staging Supabase project** (DEP-5) so staging never touches prod data.
- **Verify Supabase backups + enable PITR** (RUNBOOK.md) — could not read the
  plan/PITR status via API; confirm in the dashboard and test one restore.
- **Run the k6 load test** (docs/LOAD_TEST.md) against staging with a seeded
  load-test tenant, and record the numbers. Not run here — no staging target.
