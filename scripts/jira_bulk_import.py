#!/usr/bin/env python3
"""Bulk Jira import helper - outputs create payloads for remaining stories."""
import json
import sys

SKIP = {
    "P0-1", "P0-2", "P0-3", "P0-4",
    "P1-A-1", "P1-A-2", "P1-B-1", "P1-B-2", "P1-C-2",
    "P1-G-3", "P1-E-2", "P1-D-5",
}
# Already created in this session (story id -> key)
CREATED = {
    "P1-A-3": "SCRUM-44", "P1-A-4": "SCRUM-45", "P1-A-5": "SCRUM-47",
    "P1-B-3": "SCRUM-46", "P1-B-4": "SCRUM-48", "P1-B-5": "SCRUM-49",
    "P1-C-1": "SCRUM-50", "P1-C-3": "SCRUM-51",
    "P1-D-1": "SCRUM-52", "P1-D-2": "SCRUM-53",
    "P1-D-3": "SCRUM-68", "P1-D-4": "SCRUM-65", "P1-E-1": "SCRUM-64",
    "P1-E-3": "SCRUM-66", "P1-E-4": "SCRUM-67",
    "P1-F-1": "SCRUM-69", "P1-F-2": "SCRUM-70", "P1-F-3": "SCRUM-71",
    "P1-G-1": "SCRUM-72", "P1-G-2": "SCRUM-73",
}

CLOUD_ID = "6d8b0693-db6d-4cb1-a864-621e467b3fd4"
PROJECT_KEY = "SCRUM"


def story_description(story):
    ac_lines = "\n".join(f"- [ ] {item}" for item in story["ac"])
    return f"## Acceptance Criteria\n\n{ac_lines}\n\n**Story Points:** {story['points']}"


def subtask_description(story):
    return f"## Test Steps\n\n{story['test']}"


def main():
    with open("/Users/ahmedgaber/Edusaga/scripts/jira_roadmap_data.json") as f:
        data = json.load(f)

    remaining = [s for s in data["stories"] if s["id"] not in SKIP and s["id"] not in CREATED]
    print(json.dumps({"remaining_count": len(remaining), "stories": remaining}, indent=2))


if __name__ == "__main__":
    main()
