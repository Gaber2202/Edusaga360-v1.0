#!/usr/bin/env python3
"""Update SCRUM Jira issues for Phase 0 completion + v0.1.0-phase0-reconciliation release.

Requires env vars:
  JIRA_EMAIL       — your Atlassian account email
  JIRA_API_TOKEN   — API token from https://id.atlassian.com/manage-profile/security/api-tokens

Usage:
  export JIRA_EMAIL=you@edusaga360.com
  export JIRA_API_TOKEN=...
  python3 scripts/jira_update_phase0.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://edusaga360.atlassian.net/rest/api/3"
RELEASE = (
    "**Release:** `v0.1.0-phase0-reconciliation`\n"
    "- Commit: `1e6f7e7` on branch `Prod`\n"
    "- Tag: `v0.1.0-phase0-reconciliation`"
)

DONE = [
    ("SCRUM-3", "Phase 0 epic complete.\n\nAll reconciliation docs committed.\n\n" + RELEASE),
    ("SCRUM-4", "P0-1 complete.\n\n**Deliverable:** `docs/reconciliation/ACCESS_CHECKLIST.md`\n\n" + RELEASE),
    ("SCRUM-5", "Test case verified via ACCESS_CHECKLIST.md.\n\n" + RELEASE),
    ("SCRUM-33", "P0-2 complete.\n\n**Deliverable:** `docs/reconciliation/STATE_LEDGER_RECONCILIATION.md`\n\n" + RELEASE),
    ("SCRUM-34", "P0-3 complete.\n\n**Deliverable:** `docs/reconciliation/WORK_257_239_ASSESSMENT.md`\n\nRecommendation: cherry-pick, do not merge branches wholesale.\n\n" + RELEASE),
    ("SCRUM-35", "P0-4 complete.\n\n**Deliverable:** `docs/reconciliation/PHASE_1_ESTIMATE.md`\n\nEstimate: 28–38 engineering days. Founder sign-off requested.\n\n" + RELEASE),
    ("SCRUM-36", "P1-A-1 complete.\n\n**Deliverable:** `docs/reconciliation/TENANT_ID_WRITE_PATHS.md`\n\n" + RELEASE),
    (
        "SCRUM-37",
        "P1-A-2 verified on Prod.\n\nAll auth write paths use `app_metadata` only. "
        "Prod backfill still required (P1-A-3 / SCRUM-44).\n\n" + RELEASE,
    ),
    (
        "SCRUM-45",
        "P1-A-4 complete.\n\n**Deliverable:** `.github/scripts/guard_user_metadata_tenant_id.py` + CI job in `.github/workflows/ci.yml`\n\n"
        "Note: commit test fixture `test_guard_user_metadata_tenant_id.py` in follow-up.\n\n" + RELEASE,
    ),
    ("SCRUM-222", "P0-2 test case verified.\n\n" + RELEASE),
    ("SCRUM-223", "P0-3 test case verified.\n\n" + RELEASE),
    ("SCRUM-224", "P0-4 test case verified.\n\n" + RELEASE),
    ("SCRUM-225", "P1-A-1 test case verified.\n\n" + RELEASE),
    ("SCRUM-226", "P1-A-2 test case verified.\n\n" + RELEASE),
    ("SCRUM-56", "P1-A-4 test case verified — guard passes locally.\n\n" + RELEASE),
]

IN_PROGRESS = [
    (
        "SCRUM-41",
        "P1-G-3 runbook delivered. **Founder action required.**\n\n"
        "**Deliverable:** `docs/reconciliation/REVOKE_160_FOUNDER_RUNBOOK.md`\n\n"
        "Execute credential revocation in Supabase/Railway dashboards.\n\n" + RELEASE,
    ),
]

COMMENT_ONLY = [
    (
        "SCRUM-72",
        "Blocked — GitHub Actions billing must be restored (founder decision #10). "
        "CI workflow exists locally; guards verified.\n\n" + RELEASE,
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


def get_transitions(key: str) -> list[dict]:
    return api("GET", f"/issue/{key}/transitions").get("transitions", [])


def transition(key: str, name: str, dry_run: bool) -> bool:
    transitions = get_transitions(key)
    match = next((t for t in transitions if t["name"].lower() == name.lower()), None)
    if not match:
        names = [t["name"] for t in transitions]
        print(f"  ⚠ {key}: no '{name}' transition (available: {names})")
        return False
    if dry_run:
        print(f"  [dry-run] {key} → {name} (id {match['id']})")
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

    print("\nAdding blocker comments…")
    for key, comment in COMMENT_ONLY:
        add_comment(key, comment, args.dry_run)

    print("\nDone." if not args.dry_run else "\nDry run complete.")


if __name__ == "__main__":
    main()
