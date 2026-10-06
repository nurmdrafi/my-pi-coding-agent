---
description: Ship session work — scoped review (code files only), concise conventional commit, push
---

Ship this session's work. Commit message concise, never bloated. The commit+push output costs ≤500 tokens.

**Context first — no re-reads.** The session already contains every edit and command result. Do not run `git diff`, `git status --stat`, or `git log` to reconstruct changes. The only allowed re-read: `git status --porcelain` (paths only, no content) if genuinely uncertain which paths changed after compaction or a very long session.

**Review gate — code files only.** pre-push-review is disabled by default; this command is the only thing that enables it. If this session touched code files (functionality or business logic: source, scripts, tests, workflows), run pre-push-review scoped to exactly those files and fix what it flags. Docs (`.md`), assets, and data files carry no logic — never review them. Docs-only session → skip the gate entirely.

**Commit message — Conventional Commits, compressed.**

- Subject: `type(scope): imperative summary` — ≤50 chars preferred, hard cap 72, no trailing period. Types: `feat` `fix` `refactor` `perf` `docs` `test` `chore` `build` `ci` `style` `revert`.
- Body only when the subject cannot carry it: non-obvious why, breaking changes (`!` plus `BREAKING CHANGE` footer), data migrations, `Closes #N`. Bullets `-`, wrap at 72.
- Never: "This commit…", "I/we", AI attribution, emoji, restating what the scope already says.
- Always include a body for: breaking changes, security fixes, data migrations, reverts.

**Execute.** This invocation is the commit+push approval — do not re-ask.

1. `git add <exact touched paths>` — `-A` only for sweeping session-wide changes
2. `git commit -m "<subject>"` — add `-m "<body>"` only if needed; hook rejects → fix header, re-commit once
3. `git push`
4. Report one line: `<short-sha> <subject> → pushed to <branch>`

**Never:** amend, rebase, force-push, or commit secrets (`auth.json` stays out). If asked for the message only, output it as a code block and stop.
