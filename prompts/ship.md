---
description: Ship — conventional commit from session context, push, no re-reads
---

Commit message from session context — no `git diff/status/log`, no hook/config pre-reads; fix only if a hook rejects. Format: `type(scope): imperative summary`, body only when needed.

Precondition: the diff already passed the `pre-push-review` checklist against every `docs/issue-classes.md` class it touches — if it has not, run `/skill:pre-push-review` first; never ship an unchecked diff.

One command: `git add <exact paths> && git commit -m "<subject>" [-m "<body para>"…] && GIT_TERMINAL_PROMPT=0 git push`, then report `<short-sha> <subject> → pushed to <branch>`. Body paragraphs wrap at ≤ 100 chars/line (hook enforces).

Always run commit+push to completion. A lint/hook reject means fix and re-run — never print the message and stop. On any commit/push failure: read the error once, fix the cause, then re-run — never re-issue the same command with altered quoting or flags, and never retry without an intervening change. Message-only request (commit not asked for) → code block, stop.
