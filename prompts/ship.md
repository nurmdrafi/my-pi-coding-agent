---
description: Ship — conventional commit from session context, push, no re-reads
---

Commit message from session context — no `git diff/status/log`, no hook/config pre-reads; fix only if a hook rejects. Format: `type(scope): imperative summary`, body only when needed.

One command: `git add <exact paths> && git commit -m "<subject>" [-m "<body para>"…] && GIT_TERMINAL_PROMPT=0 git push`, then report `<short-sha> <subject> → pushed to <branch>`. Body paragraphs wrap at ≤ 100 chars/line (hook enforces).

Always run commit+push to completion. A lint/hook reject means fix and re-run — never print the message and stop. Message-only request (commit not asked for) → code block, stop.
