---
description: Update CHANGELOG.md from session context — existing pattern wins, else Keep a Changelog + SemVer
argument-hint: "[version]"
---

Update changelog for this session; output ≤500 tokens.

Source: session context, not git. Exceptions: read CHANGELOG.md; one `git status --porcelain` (paths only, committed vs uncommitted).

Existing file: mirror newest section exactly — headings, section names, bullets; committed sections untouched. New/empty file → Keep a Changelog + SemVer: MAJOR breaking, MINOR features, PATCH fixes; sections Added/Changed/Deprecated/Removed/Fixed/Security, skip empty.

Version `${1:-derived}`. Topmost committed section = released; new work bumps once, creates the section; keep appending while uncommitted (new this session or file dirty) — never bump twice pre-commit.

One bullet per user-visible change, ≤2 lines, what not how. No history, no I/we, no emoji.

Then one line only: `[X.Y.Z] <bump reason> — N entries (sections) → CHANGELOG.md`.
