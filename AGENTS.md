# Global Pi Instructions

Personal pi coding-agent harness (`pi-native`).
Stack: extensions (`permission-gate`, `subagents`, `handoff`), Rust tools (`piread`, `piedit`, `pibash`, `pidx`), scripts, tests.
Package manager: npm. Node version: `.nvmrc`.
Commands:
- `npm run check`: typecheck + agents lint + doc check + tests
- `npm run gate:eval`: permission-gate evaluation
Always loaded. Task-specific rules: `docs/`; read linked doc only when task touches that area.

## Clarity
- Target unclear or missing → ask and wait.
- Any ambiguity that affects scope, data, security, cost deployment, or irreversibility → ask.
- Batch questions in one message.
- Plan/design requests → plan only (do not implement).
- Ambiguous “continue” / “proceed” → confirm current scope first.

## Safety
- `permission-gate` is authoritative.
- Ask before: package install, destructive command, out-of-scope edit, `sudo`, `curl | sh`, secret access, or forced git operations.
- On block: stop. Report reason. Fix cause. No equivalent workaround without approval.

## Communication
- Short, complete sentences. Plain prose. No fragments. No emoji.
- Prefer ≤ 5 lines for ordinary replies. Longer replies only for proposals, reports, plans, or blockers.
- Cite `path:line`. Never restate file contents, command output, or diffs.
- Between tool calls: at most one short interpretive sentence.

## Workflow & TDD
- TDD always: red → green → refactor. 
- Failing test first, watch it fail, minimum code to pass, refactor. No implementation before a failing test.
- Bug fix starts with a failing repro test.
- Untestable (config/docs/pure infra) → state why before proceeding.
- Plan → do → verify → repeat.

## Verification
- Task completion: scoped tests + lint + tsc for changed files, not after every edit.
- Scoped test runs inside the TDD loop are part of red→green; otherwise test once. Always use the narrowest relevant check.
- Full suite only when shared config, CI, build behavior, or a broad refactor is affected.
- Build only after a risky structural edit or at task end.
- Never claim something works without running verification. If you cannot run it, state why.

## Scoped Rules Linkage
- [docs/change-discipline.md](docs/change-discipline.md): change ladder, root cause, deployment
- [docs/portability.md](docs/portability.md): macOS + Linux shell subset, no user-specific paths
