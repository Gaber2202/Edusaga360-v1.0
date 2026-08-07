---
name: testing-backend-conformance
description: How to verify a new/refactored country pack in the EduSaga 360 backend using the hermetic conformance suite, lint, typecheck, circular-dependency check, guard scripts, and golden snapshot diff.
---

# Testing EduSaga 360 backend country-pack conformance

Use this skill when a PR adds or refactors `backend/src/packs/*` and the task is to confirm the conformance suite still passes.

## Devin Secrets Needed

- None for the hermetic backend suite. The conformance tests mock Supabase, so no live DB or Supabase service role is required.

## One-shot command sequence

From `/home/ubuntu/repos/edusaga-360`:

```bash
# Ensure the requested PR branch is checked out and origin/main is up to date
git checkout <pr-branch>
git fetch origin main --depth=1

# 1. TypeScript
cd backend && npm run typecheck

# 2. Lint
npm run lint

# 3. Circular dependency check
npx madge --circular src/index.ts

# 4. Hermetic unit test suite
npm test

# 5. Guard scripts (from repo root)
cd ..
python3 .github/scripts/guard_country_literals.py
python3 .github/scripts/guard_jurisdiction_resolution.py
python3 .github/scripts/guard_invoices_balance.py

# 6. Golden snapshot integrity
git diff --stat origin/main -- backend/src/__tests__/golden/snapshots/
```

All commands should exit `0` and produce no errors.

## Verifying conformance classification counts

The conformance test file is `backend/src/packs/contract/conformance.test.ts`. It runs `32` tests per registered country pack and is parameterised over `getRegisteredPacks()`.

- `it(...)` blocks that are not inside `whenFeature(...)` always execute an assertion — count these as **ran assertion**.
- `whenImplemented(...)` blocks also execute an assertion when the method is present.
- `whenFeature(..., featureKey, liveFn, stubFn)` runs the live function when the feature is enabled, otherwise it asserts that `stubFn` throws `NotImplementedInJurisdiction`.
- The `jurisdictionFeatures` helper inside `conformance.test.ts` decides which feature flags are enabled per pack. As of PR #206: all six features (`einvoicing`, `wps`, `nationalisation_quota`, `hijri_calendar`, `documents`, `payments`) are enabled for `SA` and disabled for `AE` and `QA`.

This means the expected per-pack classification is:

- `SA`: 32 ran / 0 asserted throw / 0 neither
- `AE`: 14 ran / 18 asserted throw / 0 neither
- `QA`: 14 ran / 18 asserted throw / 0 neither

A quick way to confirm the static structure is to run `npx vitest run src/packs/contract/conformance.test.ts --reporter=verbose` and check that there are exactly `32` tests for each pack and `96` tests total. A more thorough check parses the source with the TypeScript AST to ensure the `whenFeature` list maps to the right feature flags.

## What each guard enforces

- `guard_country_literals.py` fails if forbidden country-specific strings (e.g. `ZATCA`, `SAR`, `AED`, `QAR`, hard-coded `Asia/Riyadh`) appear outside allowed directories such as `src/packs/**`, `supabase/migrations/`, `shared/database/migrations/`, `tests/`, `.github/scripts/`, and the `allowed_country_literals.json` baseline.
- `guard_jurisdiction_resolution.py` fails if `tenant.jurisdiction_code`, `tenant.jurisdictionCode`, `branch.jurisdiction_code`, or `branch.jurisdictionCode` is read outside `backend/src/lib/jurisdiction.ts`.
- `guard_invoices_balance.py` fails if any code path writes to `invoices.balance`, which is a generated column.

## Common failures and workarounds

- `npx madge` is not pre-installed globally; run it via `npx` in `backend/` so it uses the local dependency.
- If `npm test` times out, the Puppeteer-based ZATCA PDF smoke tests may need more than the default 30s on cold start. The `vitest.config.ts` already sets `testTimeout: 30000`; increase it only if the runner is constrained.
- If `guard_country_literals.py` fails on a new pack, either move the literal into `src/packs/<code>/` or update `.github/allowed_country_literals.json` with an explicit expiry and reason, then re-run the guard.
- If golden snapshots differ from `origin/main`, the PR may have changed `lib/money.ts` or `lib/tax.ts` in a way that affects Saudi output. Golden snapshots for SA must remain byte-identical when only a new pack is added.
