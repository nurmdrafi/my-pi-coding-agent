---
description: Ship — conventional commit from session context, push, no re-reads
---

Commit message from session context — no `git diff/status/log`, no hook/config pre-reads; fix only if a hook rejects. Format: `type(scope): imperative summary`, body only when needed.

Invocation approves commit+push — don't re-ask. One command: `git add <exact paths> && git commit -m "<subject>" [-m "<body para>"…] && GIT_TERMINAL_PROMPT=0 git push`, then report `<short-sha> <subject> → pushed to <branch>`. Body paragraphs wrap at ≤ 100 chars/line (hook enforces). Zero-confirm repos: drop a `PGATE_TRUST` marker file at the repo root.

Message-only request → code block, stop.
