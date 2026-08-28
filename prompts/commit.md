---
description: Suggest ONE conventional commit message from staged changes
argument-hint: "[scope]"
---
Suggest one conventional commit message for the staged changes. Run `git diff --cached --stat` first; read the full diff only if the stat is insufficient. If nothing is staged, say so and STOP — never run plain `git diff`. Scope: use `$1` if given, else infer from paths, else omit. Subject: imperative, lowercase, ≤72 chars. Output only the message in one fence. Do not commit.
