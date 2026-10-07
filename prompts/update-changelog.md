---
description: Update CHANGELOG.md from session context — Keep a Changelog + SemVer, existing pattern wins
argument-hint: "[version]"
---

Update the changelog for this session's work. New section ≤500 tokens.

**Context first.** Session context, not git (`diff`/`log`/`status`), reconstructs the changes. Sole exception: one `git status --porcelain` (paths only) to tell committed from uncommitted sections. Reading `CHANGELOG.md` is expected.

**Existing pattern wins.** Mirror the newest section exactly — heading/date syntax, section names, bullet shape; never edit committed sections. New or silent file → Keep a Changelog + SemVer: MAJOR=breaking, MINOR=features, PATCH=fixes; sections Added/Changed/Deprecated/Removed/Fixed/Security, omit empty.

Version: `${1:-derived from the changes}`. Topmost committed section = released; new work bumps and creates that section; while it stays uncommitted (written this session or CHANGELOG.md dirty), keep adding to it — never bump twice before a commit.

Entries: one bullet per user-visible change, ≤2 lines — what changed, not how; no iteration history, no "I/we", no emoji.

**Execute.** Edit the file, then report one line: `[X.Y.Z] <bump reason> — N entries (sections: …) → CHANGELOG.md`. Nothing else.
