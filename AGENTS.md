# Global Pi Instructions

Personal pi coding-agent harness (`pi-native`): extensions (permission-gate, subagents, handoff), Rust native tools (piread, piedit, pibash, pidx), scripts, tests. npm; Node pinned by `.nvmrc`. Commands: `npm run check` (typecheck + agents lint + doc check + tests), `npm run gate:eval`.

Always loaded. Task rule sets live in `docs/` — follow the link when a task touches that area.

## Always-on rules

### Clarity

- Target unclear or missing → ask, wait. Never guess, never substitute nearest match.
- Batch all open questions into one message.
- Plan/design request → plan only.
- Ambiguous "continue"/"proceed" → confirm scope first.

### Scope

- Explicit instruction = approval for the named action + directly implied reads/searches.
- Approved task → plan, do, verify, autonomously.
- Ask before: package installs, destructive commands, out-of-scope changes, `sudo`, `curl | sh`. Full list: [docs/security.md](docs/security.md).
- Chat "yes" or the invoking message = approval.

### Precedence

- Global + repo context load together; neither replaces the other.
- Conflict → repo `AGENTS.md`/`.pi` wins; this file fills gaps.
- In-session user instruction outranks global/repo/template: apply the override, one-line deviation note, never relitigate.

### Safety

- Enforced by permission-gate; block reason = stop, fix the cause, never retry differently. Full list: [docs/security.md](docs/security.md).

### Communication

- Telegram style: short complete sentences, plain prose, no fragments/emoji.
- Cap ~5 lines/reply.
- Interstitial text between tool calls: ≤1 short sentence, interpret-only.
- Cap may be exceeded only by Propose/Report/plan deliverables.
- Analysis/audit deliverable → dated file under `audit-reports/`, plus ≤5-line chat summary and path.

### Verification

- Scoped tests + lint + tsc on changed files only, at task completion — not after every edit. Never the full suite: husky gates commits.
- Build only after risky structural edits (new files, import-graph changes) or at task end; re-reading verifies plain edits.

### Tooling defaults

- Rust tools first: [docs/tooling-defaults.md](docs/tooling-defaults.md). Search `rg`, file find `fd`. Never `grep`/`find` first — error-only fallbacks.
- Codemode script → `tools.pibash`/`tools.piread`/`tools.piedit`/`tools.pidx`, never `tools.bash`/`tools.read` (gate P3). Script = async function body, must parse; gate blocks a non-parsing script with a `line:col` pointer (gate P4). Codemode for scripted aggregation across several calls only; one command or one read → `pibash`/`piread` direct.
- Codemode is off by default: declaring it costs ~426 tokens of prefix every turn. Enable only when an aggregation task justifies it.
- Output caps: bash/pibash 40 lines / 2KB (H1); read/piread over 300 lines / 8KB capped with a spill pointer (H1b) — keep calls targeted.

### GitHub issues

- Repo has gh issues → check the related issue, cover every acceptance criterion, state deviations. Flow: [docs/agent-hygiene.md](docs/agent-hygiene.md).

## Scoped rule sets

- [docs/change-discipline.md](docs/change-discipline.md) — ponytail ladder, root-cause fixes, deployment constraints
- [docs/agent-hygiene.md](docs/agent-hygiene.md) — toolchain pins, edit anchors, issue/commit discipline
- [docs/security.md](docs/security.md) — ask-list, secrets, git protections
- [docs/portability.md](docs/portability.md) — macOS+Linux shell subset, no absolute user paths
- [docs/tooling-defaults.md](docs/tooling-defaults.md) — Rust-first: piread/piedit/pidx, rg/fd, fallback etiquette
- [docs/token-economy.md](docs/token-economy.md) — read/run discipline, batching, session budget
- [docs/workflow.md](docs/workflow.md) — TDD, plan/do/verify cadence, session length
