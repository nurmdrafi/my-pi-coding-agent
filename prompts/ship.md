---
description: Ship — conventional commit from session context, push, no re-reads
---

Commit message from session context — no `git diff/status/log`, no hook/config pre-reads; fix only if a hook rejects. Format: `type(scope): imperative summary`, body only when needed.

Invocation approves commit+push — don't re-ask: `git add <exact paths>` → `git commit -m "<subject>"` → `git push` → report `<short-sha> <subject> → pushed to <branch>`.

Message-only request → code block, stop.
