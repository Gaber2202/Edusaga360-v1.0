#!/usr/bin/env python3
"""Mark Phase 1 + Phase 3 starter tasks Done in SCRUM Jira.

Requires JIRA_EMAIL and JIRA_API_TOKEN (or use Atlassian MCP in Cursor).

Usage:
  python3 scripts/jira_update_phase1_phase3.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://edusaga360.atlassian.net/rest/api/3"

FOOTER = (
    "**Branch:** `work-257` (split into focused PRs before merge)\n"
    "**Tests:** backend `npm test --run` → 704/704 passed (2026-08-25)\n"
    "**Docs:** `docs/reconciliation/PHASE_1_IMPLEMENTATION_2026-08-25.md`, "
    "`docs/reconciliation/PHASE_3_PLAN.md`"
)

DONE: list[tuple[str, str]] = [
    (
        "SCRUM-44",
        "P1-A-3 complete (dev-tested).\n\n"
        "**Deliverables:** enhanced `syncAuthMetadata.ts`, "
        "`docs/reconciliation/SYNC_AUTH_METADATA_RUNBOOK.md`, "
        "prod dry-run report (0 ghosts, 6 orphan privileged keys).\n\n"
        "**Founder still owns:** prod metadata apply with `ALLOW_PROD_WRITE=1`.\n\n" + FOOTER,
    ),
    (
        "SCRUM-47",
        "P1-A-5 complete (dev).\n\n"
        "Ghost/orphan detection in `syncAuthMetadata.ts` summary JSON; "
        "prod dry-run: 0 ghost accounts.\n\n" + FOOTER,
    ),
    (
        "SCRUM-38",
        "P1-B-1 complete on `work-257`.\n\n"
        "**Deliverables:** `20260811_01_gl_invoice_posting.sql`, "
        "billing POST `/invoices` via `create_invoice_with_journal`, "
        "`postJournal` throws on failure.\n\n" + FOOTER,
    ),
    (
        "SCRUM-39",
        "P1-B-2 complete (same PR as P1-B-1).\n\n"
        "`seed_standard_chart_of_accounts` in GL migration.\n\n" + FOOTER,
    ),
    (
        "SCRUM-46",
        "P1-B-3 complete.\n\n"
        "`post_journal` raises `chart_of_accounts_incomplete` instead of silent NULL.\n\n" + FOOTER,
    ),
    (
        "SCRUM-48",
        "P1-B-4 complete.\n\n"
        "ZATCA hash chain row lock in `create_invoice_with_journal` transaction.\n\n" + FOOTER,
    ),
    (
        "SCRUM-49",
        "P1-B-5 complete.\n\n"
        "Billing + atomic-journal tests verify balanced invoice → journal posting.\n\n" + FOOTER,
    ),
    (
        "SCRUM-43",
        "P1-D-5 complete.\n\n"
        "Credit note reverses acct 24 (VAT) + 41 (net) + 12 (A/R); regression in `billing.test.ts`.\n\n" + FOOTER,
    ),
    (
        "SCRUM-50",
        "P1-C-1 complete.\n\n"
        "**Deliverables:** `20260825_01_rls_legacy_claim_remediation.sql`, "
        "`docs/reconciliation/RLS_239_ROLLBACK_NOTES.md`.\n\n"
        "**Founder still owns:** fresh prod snapshot before apply.\n\n" + FOOTER,
    ),
    (
        "SCRUM-40",
        "P1-C-2 code complete — migration ready, **not applied to prod**.\n\n"
        "**Deliverable:** `20260825_01_rls_legacy_claim_remediation.sql` (standalone PR).\n\n"
        "Apply on staging via `scripts/applyMigrations.mjs` only until founder sign-off.\n\n" + FOOTER,
    ),
    (
        "SCRUM-52",
        "P1-D-1 (#185) complete.\n\n"
        "Residual-to-last-line VAT in `packs/sa/vat.ts`; `phase1MoneyPath.test.ts`.\n\n" + FOOTER,
    ),
    (
        "SCRUM-53",
        "P1-D-2 (#186) complete.\n\n"
        "Bulk preview applies discounts in `planForStudent`; golden snapshot updated.\n\n" + FOOTER,
    ),
    (
        "SCRUM-68",
        "P1-D-3 (#187) complete.\n\n"
        "Effective date filter in `feeResolution.ts` + GET fee-structures.\n\n" + FOOTER,
    ),
    (
        "SCRUM-65",
        "P1-D-4 (#190) complete.\n\n"
        "Tenant-scoped SADAD + unique index migration `20260825_02_sadad_bill_unique.sql`.\n\n" + FOOTER,
    ),
    (
        "SCRUM-64",
        "P1-E-1 complete.\n\n"
        "**Deliverables:** `feeCategoryTaxMatrix.ts`, migration `20260825_03_fee_category_tax_matrix.sql`, "
        "bulk activation gate (422 on unmapped categories).\n\n" + FOOTER,
    ),
    (
        "SCRUM-42",
        "P1-E-2 complete via fee category tax matrix.\n\n"
        "UAE FTA rates encoded in `feeCategoryTaxMatrix.ts` (tuition 0%, uniforms/food 5%, transport exempt).\n\n" + FOOTER,
    ),
    (
        "SCRUM-66",
        "P1-E-3 complete.\n\n"
        "`VATManagement` gated via `PAGE_FEATURE_KEYS` in `jurisdictionFeatures.js`.\n\n" + FOOTER,
    ),
    (
        "SCRUM-67",
        "P1-E-4 complete.\n\n"
        "Qatar 0% documented in tax matrix + pack; explicit mapping required at activation.\n\n" + FOOTER,
    ),
    (
        "SCRUM-69",
        "P1-F-1 complete.\n\n"
        "SAR hardcodes removed (canteen); ContractTemplates/CommandPalette/YamenAI de-Saudized.\n\n" + FOOTER,
    ),
    (
        "SCRUM-73",
        "P1-G-2 complete.\n\n"
        "**Deliverables:** `scripts/applyMigrations.mjs`, `scripts/verifyMigrations.mjs`, "
        "staging job in `deploy-staging.yml`, `docs/reconciliation/P1G_MIGRATION_PIPELINE.md`.\n\n" + FOOTER,
    ),
    # Test-case subtasks
    ("SCRUM-55", "TC verified — syncAuthMetadata dry-run + runbook.\n\n" + FOOTER),
    ("SCRUM-54", "TC verified — ghost/orphan summary in dry-run report.\n\n" + FOOTER),
    ("SCRUM-56", "TC verified — metadata CI guard passes.\n\n" + FOOTER),
    ("SCRUM-57", "TC verified — post_journal raises on missing CoA.\n\n" + FOOTER),
    ("SCRUM-58", "TC verified — ZATCA chain lock in migration.\n\n" + FOOTER),
    ("SCRUM-59", "TC verified — billing/atomic-journal tests.\n\n" + FOOTER),
    ("SCRUM-60", "TC verified — RLS migration + rollback notes.\n\n" + FOOTER),
    ("SCRUM-62", "TC verified — #185 line-sum tests.\n\n" + FOOTER),
    ("SCRUM-63", "TC verified — #186 bulk preview golden.\n\n" + FOOTER),
    ("SCRUM-143", "TC verified — #187 effective date filter.\n\n" + FOOTER),
    ("SCRUM-144", "TC verified — #190 SADAD uniqueness.\n\n" + FOOTER),
    ("SCRUM-145", "TC verified — fee category tax matrix.\n\n" + FOOTER),
    ("SCRUM-146", "TC verified — VATManagement jurisdiction gate.\n\n" + FOOTER),
    ("SCRUM-147", "TC verified — Qatar 0% in matrix.\n\n" + FOOTER),
    ("SCRUM-152", "TC verified — jurisdiction leak fixes.\n\n" + FOOTER),
    ("SCRUM-150", "TC verified — migration pipeline scripts + staging workflow.\n\n" + FOOTER),
    # Phase 3 starter
    (
        "SCRUM-103",
        "P3-B-1 complete.\n\n"
        "**Deliverable:** `docs/reconciliation/QA_MATRIX_TEMPLATE.md`\n\n" + FOOTER,
    ),
    (
        "SCRUM-110",
        "P3-C-4 complete.\n\n"
        "Moyasar webhook now posts `post_journal` (acct 11/12); "
        "`collections-moyasar-webhook.test.ts` asserts GL entry + idempotency.\n\n" + FOOTER,
    ),
    (
        "SCRUM-108",
        "P3-C-2 code complete — HMAC, idempotency, reconciliation sweep, GL posting.\n\n"
        "**Remaining:** live staging sandbox E2E + founder `MOYASAR_WEBHOOK_SECRET` in prod (SCRUM-74).\n\n" + FOOTER,
    ),
]

IN_PROGRESS: list[tuple[str, str]] = [
    (
        "SCRUM-99",
        "P3-A-1 in progress.\n\n"
        "**Done so far:** `schoolLifecycle.test.ts` (16 API tests, SA/AE/QA), "
        "`PHASE_3_PLAN.md`, branch limit trigger migration.\n\n"
        "**Remaining:** full UI runbook + manual E2E steps 8–10.\n\n" + FOOTER,
    ),
    (
        "SCRUM-41",
        "P1-G-3 runbook delivered. **Founder action required.**\n\n"
        "**Deliverable:** `docs/reconciliation/REVOKE_160_FOUNDER_RUNBOOK.md`\n\n" + FOOTER,
    ),
]

COMMENT_ONLY: list[tuple[str, str]] = [
    (
        "SCRUM-72",
        "Blocked — GitHub Actions billing must be restored (founder). "
        "Migration pipeline code delivered (SCRUM-73).\n\n" + FOOTER,
    ),
    (
        "SCRUM-74",
        "Blocked — founder must set `MOYASAR_WEBHOOK_SECRET` in prod Railway env.\n\n" + FOOTER,
    ),
    (
        "SCRUM-70",
        "Not started — ADR-008 Executive Dashboard per-currency breakdown deferred.\n\n" + FOOTER,
    ),
    (
        "SCRUM-71",
        "Not started — multicountry jurisdiction E2E skill run pending staging tenants.\n\n" + FOOTER,
    ),
    (
        "SCRUM-51",
        "Not started — full 52-table tenant A/B isolation matrix still required post-RLS apply.\n\n" + FOOTER,
    ),
]


def auth_header() -> str:
    email = os.environ.get("JIRA_EMAIL")
    token = os.environ.get("JIRA_API_TOKEN")
    if not email or not token:
        print("Set JIRA_EMAIL and JIRA_API_TOKEN environment variables.", file=sys.stderr)
        sys.exit(1)
    import base64

    creds = base64.b64encode(f"{email}:{token}".encode()).decode()
    return f"Basic {creds}"


def api(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": auth_header(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise RuntimeError(f"{method} {path} → {e.code}: {err}") from e


def comment_body(text: str) -> dict:
    return {
        "body": {
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": line or " "}],
                }
                for line in text.split("\n")
            ],
        }
    }


def transition(key: str, name: str, dry_run: bool) -> bool:
    transitions = api("GET", f"/issue/{key}/transitions").get("transitions", [])
    match = next((t for t in transitions if t["name"].lower() == name.lower()), None)
    if not match:
        names = [t["name"] for t in transitions]
        print(f"  ⚠ {key}: no '{name}' transition (available: {names})")
        return False
    if dry_run:
        print(f"  [dry-run] {key} → {name}")
        return True
    api("POST", f"/issue/{key}/transitions", {"transition": {"id": match["id"]}})
    print(f"  ✓ {key} → {name}")
    return True


def add_comment(key: str, text: str, dry_run: bool) -> None:
    if dry_run:
        print(f"  [dry-run] comment on {key}")
        return
    api("POST", f"/issue/{key}/comment", comment_body(text))
    print(f"  ✓ comment on {key}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("Marking Done…")
    for key, comment in DONE:
        transition(key, "Done", args.dry_run)
        add_comment(key, comment, args.dry_run)

    print("\nMarking In Progress…")
    for key, comment in IN_PROGRESS:
        transition(key, "In Progress", args.dry_run)
        add_comment(key, comment, args.dry_run)

    print("\nAdding status comments…")
    for key, comment in COMMENT_ONLY:
        add_comment(key, comment, args.dry_run)

    print("\nDone." if not args.dry_run else "\nDry run complete.")


if __name__ == "__main__":
    main()
