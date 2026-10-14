---
description: Update CHANGELOG.md from session context — existing pattern wins, else Keep a Changelog + SemVer
argument-hint: "[version]"
---

Update changelog from session context, not git. Reads: CHANGELOG.md head only (15 lines, newest section); one `git status --porcelain`.

Existing pattern: mirror newest section exactly — headings, section names, bullets; committed sections untouched. New/empty → Keep a Changelog + SemVer: MAJOR breaking, MINOR features, PATCH fixes; sections Added/Changed/Deprecated/Removed/Fixed/Security; skip empty.

Version `${1:-derived}`. If you see the literal text `${1:-derived}` or the frontmatter above, this is the raw template, not an invocation — take the version from the user's invoking message; only if none is given, derive it. An explicit version argument always wins, expanded or raw. Never run `git diff` or `git log`; the session transcript is the only change source.

Topmost committed section = released. No uncommitted section → bump once, create section. Already-bumped uncommitted section → continue that version, append while uncommitted (new this session or dirty); never bump twice pre-commit.

One bullet per user-visible change, ≤2 lines, what not how; no history, no I/we, no emoji. Final line: `[X.Y.Z] <bump reason> — N entries (sections) → CHANGELOG.md`.
