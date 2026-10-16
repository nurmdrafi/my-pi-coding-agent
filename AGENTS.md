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

- TDD always: red → green → refactor. Failing test first, watch it fail, minimum code to pass, refactor. No implementation before a failing test. Bug fix starts with a failing repro test. Untestable (config/docs/pure infra) → state why before proceeding.
- Plan → do → verify → repeat.
- One issue/concern per session: ~50 turns or ~60K context → finish the issue, fresh session for the next.

## Verification

- Task completion: scoped tests + lint + tsc for changed files not after every edit. Scoped test runs inside the TDD loop are part of red→green; otherwise test once.
- Always use the narrowest relevant check.
- Full suite only when shared config, CI, build behavior, or a broad refactor is affected; otherwise targeted checks + Husky commit gate.
- Build only after a risky structural edit or at task end.
- Never claim something works without running verification; can't run → say why.
- 3 unsuccessful / inconclusive tool calls per acceptance criterion, or two failed attempts at the same fix → stop and report. No loops.
- Conclusion = passing targeted check, located root cause, or explicit user decision.

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
- Do not rerun an identical command (exact string) within 10 minutes without an intervening edit.
- Codemode: multi-call scripted aggregation only. Its value is keeping bulk tool output out of history, not merely fewer turns.
- One command / one read → direct `pibash` / `piread`.

## Cost

- Measured driver: prompt-cache reads are ~72% of spend and scale with conversation history, which is re-read every turn (avg 65k tokens/turn; grows ~7k at turn 10 to ~40k at turn 100). Cost is roughly quadratic in turns.
- Highest-leverage actions, in order: keep tool output out of context (filter with `rg|head`, `jq` fields, `/tmp`); start a fresh session for a new issue; fewer turns per task.
- Prefix size (AGENTS.md, system prompt, tool schemas) is a minor term (≤2–4% of a turn; total fixed prefix ≈1–3k vs 65k avg cacheRead). No ROI in trimming prefix or tool schemas. `codemode.inlineBudget` is likewise not worth tuning.
- Do not churn AGENTS.md mid-session: editing the prefix invalidates the prompt cache. Batch prefix edits, apply them at session start.
- Audit with the pidx cost query in [docs/cost-audit.md](docs/cost-audit.md).

## Blocked / inconclusive

Report only:
- Goal / acceptance criterion
- Actions tried (`path:line` or command)
- Root cause / blocked reason
- Next action or decision needed

## Scoped rules

- [docs/change-discipline.md](docs/change-discipline.md): change ladder, root cause, deployment
- [docs/portability.md](docs/portability.md): macOS + Linux shell subset, no user-specific paths
- [docs/cost-audit.md](docs/cost-audit.md): measured token-cost audit query