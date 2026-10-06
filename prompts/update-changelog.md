---
description: Update CHANGELOG.md from session context — Keep a Changelog + SemVer, existing pattern wins
argument-hint: "[version]"
---

Update the changelog for this session's work. Minimal entries — new section ≤500 tokens.

**Context first.** No git tools (`git diff`/`git log`/`git status`) to reconstruct changes; use what this session did. Reading `CHANGELOG.md` itself is allowed.

**Existing pattern wins.** Mirror the file's most recent section exactly — heading/date syntax, sections, bullet shape. Preserve the header and prior committed sections verbatim; insert the new section where the file places new versions (below the header). Where the file is silent (or missing), follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) + [Semantic Versioning](https://semver.org/spec/v2.0.0.html): MAJOR=breaking, MINOR=new features, PATCH=fixes; sections in order Added/Changed/Deprecated/Removed/Fixed/Security, omit empty. New file: standard KaC header (format + SemVer lines) first.

Version: `${1:-derived from the changes}`.

**Versioning.** The topmost committed section is the released version. New work → bump per MAJOR/MINOR/PATCH and create that section; while it stays uncommitted (written this session, or CHANGELOG.md dirty per one allowed `git status --porcelain` paths-only check), keep adding entries to it — never bump twice before a commit, never edit committed sections.

Entries: one bullet per user-visible change, ≤2 lines each; what changed only — no how, no iteration history, no internal noise, no "I/we", no emoji.

**Execute.** Edit the file, then report one line: `[X.Y.Z] <bump reason> — N entries (sections: …) → CHANGELOG.md`. Nothing else.
