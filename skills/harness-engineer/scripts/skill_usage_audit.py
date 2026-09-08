# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

"""
Pi Agent Skill Audit Script

Scans pi session logs for skill invocation records and cross-references
against installed skills in ~/.pi/agent/skills/.

Usage:
    uv run --script skill_usage_audit.py                     # full audit
    uv run --script skill_usage_audit.py --sessions <dir>    # custom sessions dir
    uv run --script skill_usage_audit.py --skills <dir>      # custom skills dir
"""

import json
import os
import re
import sys
from collections import Counter
from pathlib import Path


def parse_args():
    sessions = os.path.expanduser("~/.pi/agent/sessions")
    skills = os.path.expanduser("~/.pi/agent/skills")

    for i, a in enumerate(sys.argv[1:]):
        if a == "--sessions" and i + 2 < len(sys.argv):
            sessions = sys.argv[i + 2]
        if a == "--skills" and i + 2 < len(sys.argv):
            skills = sys.argv[i + 2]

    return sessions, skills


def count_skill_invocations(sessions_dir: str) -> Counter:
    """Parse pi session logs and count skill invocations.

    Two invocation patterns are tracked:
      1. User messages containing <skill name="..."> tags
      2. Agent tool_calls reading skills/<name>/SKILL.md via the read tool
    """
    counter: Counter = Counter()
    sessions_path = Path(sessions_dir)

    if not sessions_path.is_dir():
        print(f"⚠  Session directory not found: {sessions_dir}")
        return counter

    for dir_entry in sorted(sessions_path.iterdir()):
        if not dir_entry.is_dir():
            continue
        for file_entry in sorted(dir_entry.iterdir()):
            if file_entry.suffix != ".jsonl":
                continue
            try:
                with open(file_entry, encoding="utf-8") as f:
                    for line in f:
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        record_type = data.get("type")
                        msg = data.get("message", {})

                        # Pattern 1: user message with <skill name="...">
                        if record_type == "message" and msg.get("role") == "user":
                            for item in msg.get("content") or []:
                                if isinstance(item, dict) and item.get("type") == "text":
                                    for match in re.finditer(
                                        r'<skill name="([^"]+)"', item.get("text", "")
                                    ):
                                        counter[match.group(1)] += 1

                        # Pattern 2: agent tool_call reading SKILL.md
                        if record_type == "message" and msg.get("role") == "assistant":
                            for item in msg.get("content") or []:
                                if (
                                    isinstance(item, dict)
                                    and item.get("type") == "toolCall"
                                    and item.get("name") == "read"
                                ):
                                    path = item.get("arguments", {}).get("path", "")
                                    m = re.search(r"skills/([^/]+)/SKILL\.md", path)
                                    if m:
                                        counter[m.group(1)] += 1
            except (OSError, UnicodeDecodeError) as e:
                print(f"⚠  Error reading {file_entry}: {e}")

    return counter


def get_installed_skills(skills_dir: str) -> list[str]:
    """List all skill directories in the global install location."""
    skills_path = Path(skills_dir)
    if not skills_path.is_dir():
        print(f"⚠  Skills directory not found: {skills_dir}")
        return []
    return sorted(
        d.name for d in skills_path.iterdir() if d.is_dir() and not d.name.startswith(".")
    )


def categorize(counts: Counter, installed: list[str]) -> dict:
    """Categorize skills into usage tiers and separate installed vs uninstalled."""
    result = {
        "high": [],  # >= 10
        "medium": [],  # 3-9
        "low": [],  # 1-2
        "unused": [],  # 0 but installed
    }

    for skill in installed:
        count = counts.get(skill, 0)
        if count >= 10:
            result["high"].append((skill, count))
        elif count >= 3:
            result["medium"].append((skill, count))
        elif count >= 1:
            result["low"].append((skill, count))
        else:
            result["unused"].append((skill, 0))

    return result


def print_report(
    categorized: dict,
    total_calls: int,
    used_installed: int,
    installed_count: int,
    sessions_dir: str,
    skills_dir: str,
):
    """Print a formatted audit report."""
    print()
    print("=" * 60)
    print("  Pi Agent Skill Audit Report")
    print("=" * 60)
    print(f"  Sessions scanned:     {sessions_dir}")
    print(f"  Skills directory:     {skills_dir}")
    print(f"  Installed skills:     {installed_count}")
    print(f"  Skills with usage:    {used_installed}")
    print(f"  Total invocations:    {total_calls}")
    print()

    for tier_name, tier_label, tier_icon in [
        ("high", "🔥  HIGH USAGE (>= 10)", "🔥"),
        ("medium", "✅  MEDIUM USAGE (3-9)", "✅"),
        ("low", "⚠️  LOW USAGE (1-2)", "⚠️"),
        ("unused", "❌  UNUSED (0)", "❌"),
    ]:
        items = categorized[tier_name]
        if not items:
            continue
        print(f"  {tier_label}")
        print(f"  {'─' * 50}")
        for skill, count in sorted(items, key=lambda x: (-x[1], x[0])):
            bar = "█" * min(count, 20) if count > 0 else ""
            print(f"  {tier_icon}  {skill:<30} {count:>4}  {bar}")
        print()

    # Summary bar
    used = sum(len(v) for k, v in categorized.items() if k != "unused")
    unused_count = len(categorized["unused"])
    print(f"  {'─' * 50}")
    print(f"  Used:   {used}/{installed_count}  ({used / installed_count * 100:.0f}%)")
    print(
        f"  Unused: {unused_count}/{installed_count}  ({unused_count / installed_count * 100:.0f}%)"
    )
    print()


def main():
    sessions_dir, skills_dir = parse_args()
    print(f"🔍  Scanning sessions: {sessions_dir}")
    counts = count_skill_invocations(sessions_dir)
    installed = get_installed_skills(skills_dir)

    if not installed:
        print("No installed skills found.")
        return

    categorized = categorize(counts, installed)
    total_calls = sum(counts.values())
    used_installed = sum(
        1 for s in installed if counts.get(s, 0) > 0
    )

    print_report(
        categorized, total_calls, used_installed, len(installed), sessions_dir, skills_dir
    )

    # Unused list (for piping / copy-paste)
    unused = list(categorized["unused"])
    if unused:
        print("  Skills with zero usage (review each SKILL.md before removing):")
        print(f"  {' '.join(s[0] for s in unused)}")
        print()


if __name__ == "__main__":
    main()
