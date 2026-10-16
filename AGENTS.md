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
- Ask before:
  - package install
  - destructive command
  - out-of-scope edit
  - `sudo`
  - `curl | sh`
  - secret access
  - force git operation
- On block: stop. Report reason. Fix cause. No equivalent workaround without approval.

## Communication

- Short, complete sentences. Plain prose. No fragments. No emoji.
- Prefer ≤ 5 lines for ordinary replies.
- Longer replies only for proposals, reports, plans, or blockers.
- Cite `path:line`.
- Never restate file contents, command output, or diffs.
- Between tool calls: at most one short interpretive sentence.

## Workflow

- TDD always: red → green → refactor. 
- Failing test first, watch it fail, minimum code to pass, refactor. 
- No implementation before a failing test. 
- Bug fix starts with a failing repro test. 
- Untestable (config/docs/pure infra) → state why before proceeding.
- Plan → do → verify → repeat.

## Verification

- Task completion: scoped tests + lint + tsc for changed files not after every edit. 
- Scoped test runs inside the TDD loop are part of red→green; otherwise test once.
- Always use the narrowest relevant check.
- Full suite only when shared config, CI, build behavior, or a broad refactor is affected; otherwise targeted checks + Husky commit gate.
- Build only after a risky structural edit or at task end.
- Never claim something works without running verification; can't run → say why.

## Tooling

- Prefer native tools: `piread`, `piedit`, `pibash`, `pidx`.
- Search: `rg`. File discovery: `fd`.
- Built-in `grep` / `find`: only if `rg` / `fd` / native tool is unavailable or fails.
- Native-tool failure: report, then use the narrowest built-in fallback.
- Read only task-named files or files needed for acceptance criteria.
- `rg -n` first; then read only the relevant hit or a narrow range.
- Do not re-read context already present (exception: after compaction).
- Batch independent tool calls.
- Large/raw output: `pibash` + `jq` → `/tmp`; read only the needed fields.
- Oversize output: tool writes an overflow file and returns a compact status + path.
- Request a narrower command, filter, range, or fields. Do not read the full overflow.
- Codemode: multi-call scripted aggregation only. Its value is keeping bulk tool output out of history, not merely fewer turns.
- One command / one read → direct `pibash` / `piread`.

## Scoped rules

- [docs/change-discipline.md](docs/change-discipline.md): change ladder, root cause, deployment
- [docs/portability.md](docs/portability.md): macOS + Linux shell subset, no user-specific paths