---
description: Ship session work — concise conventional commit, push, no re-reads
---

Ship this session's work. Commit+push output ≤500 tokens.

**No re-reads.** Session context has every change — no `git diff`/`git status`/`git log` to reconstruct it (only exception: `git status --porcelain`, paths only, if compaction left path uncertainty). Never pre-read `.husky/`, `commitlint.config.*`, or `lint-staged` blocks — hooks run on their own; adapt only if one rejects.

**Message.** `type(scope): imperative summary` — ≤50 chars preferred, 72 hard cap, no trailing period. Types: feat fix refactor perf docs test chore build ci style revert. Body only for non-obvious why, breaking (`!` + `BREAKING CHANGE:` footer), migrations, security fixes, reverts, `Closes #N` — bullets `-`, wrap 72. Never: "This commit…", I/we, AI attribution, emoji, restating the scope.

**Execute** — this invocation approves commit+push, do not re-ask: `git add <exact touched paths>` (`-A` only for sweeping changes) → `git commit -m "<subject>"` (+ `-m "<body>"` if needed; hook rejects → fix, re-commit once) → `git push` → report one line: `<short-sha> <subject> → pushed to <branch>`.

**Never:** amend, rebase, force-push, commit secrets (`auth.json` stays out). Message-only request → code block, stop.
