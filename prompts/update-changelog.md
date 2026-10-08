---
description: Update CHANGELOG.md from session context — existing pattern wins, else Keep a Changelog + SemVer
argument-hint: "[version]"
---

Update the changelog from session context, not git. Reads: CHANGELOG.md head only (15 lines — newest section); one `git status --porcelain`.

Existing: mirror newest section exactly — headings, section names, bullets; committed sections untouched. New/empty → Keep a Changelog + SemVer: MAJOR breaking, MINOR features, PATCH fixes; sections Added/Changed/Deprecated/Removed/Fixed/Security, skip empty.

Version `${1:-derived}`. Topmost committed section = released. No uncommitted section → new work bumps once, creates the section. Already-bumped uncommitted section → continue that version — append while uncommitted (new this session or dirty); never bump twice pre-commit.

One bullet per user-visible change, ≤2 lines, what not how; no history, no I/we, no emoji. Final line: `[X.Y.Z] <bump reason> — N entries (sections) → CHANGELOG.md`.
