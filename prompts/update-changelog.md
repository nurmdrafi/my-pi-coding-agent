---
description: Update CHANGELOG.md from session context — arg version wins, else Keep a Changelog + SemVer
argument-hint: "[version]"
---

Source: session transcript only. Never `git log`/`git diff`, never read codebase for entries. Reads allowed: CHANGELOG.md head (15 lines), `git status --porcelain`.

Raw `${1:-derived}` or frontmatter visible = raw template → take version from invoking message.

Version rules:
- Explicit version given → use it, always. Exists in changelog → update that section. Not exists → create new section with it. Never bump, never substitute.
- No version → derive. No uncommitted section → bump once, create. Uncommitted section present → continue it, append. Never bump twice pre-commit.

Format: mirror newest existing section style. New/empty → Keep a Changelog: Added/Changed/Deprecated/Removed/Fixed/Security, MAJOR breaking/MINOR feat/PATCH fix. Skip empty sections.

Bullets: one per user-visible change, ≤2 lines, what not how. No history, no I/we, no emoji.

End: `[X.Y.Z] <reason> — N entries (sections) → CHANGELOG.md`
