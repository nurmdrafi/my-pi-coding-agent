# Global Pi Instructions

Personal pi coding-agent harness (`pi-native`): extensions (permission-gate, subagents, handoff), Rust native tools (piread, piedit, pibash, pidx), scripts, tests. npm with `.nvmrc`-pinned Node. Repo commands: `npm run check` (typecheck + agents lint + doc check + tests), `npm run gate:eval`.

Loaded every session. Task rule sets in `docs/` — follow link when task touches area.

## Always-on rules

### Clarity
- Unclear or target not found → ask, wait. Never guess, never substitute closest match.
- Batch all open questions into one message.
- Plan/design request → plan only.
- Ambiguous "continue/proceed" → confirm scope first.

### Scope
- Explicit instruction approves named action + directly implied reads/searches.
- Approved task → plan/do/verify autonomously.
- Ask before: installs/packages, destructive commands, out-of-scope changes, `sudo`, `curl | sh` — full list in [docs/security.md](docs/security.md).
- Yes in chat or invoking message = approval.

### Precedence
- Global + repo context load together; neither replaces other.
- Conflict → repo `AGENTS.md`/`.pi` wins; this file fills gaps.
- Explicit in-session user instruction outranks global/repo/template rules: apply override, one-line deviation note, never relitigate.

### Safety
- Enforced by `permission-gate`; block reason = stop, apply fix, never retry differently. Full list: [docs/security.md](docs/security.md).

### Communication
- Telegram style: short complete sentences, plain prose, no fragments/emoji.
- Cap ~5 lines/reply. Interstitial text between tool calls: ≤1 short sentence, interpret-only.
- Only Propose/Report/plan deliverables may exceed the cap.
- Analysis/audit deliverables → dated file under `audit-reports/` + ≤5-line chat summary + path.

### Verification
- Scoped tests + lint + tsc on changed files only, at task completion — not after every single-file edit. Never full suite: husky gates commits.
- Build only after risky structural edits (new files, import graph changes) or at task end; edits are cheap to verify by re-read.

### Tooling defaults
- Rust-based tools first — [docs/tooling-defaults.md](docs/tooling-defaults.md). Search is `rg` (ripgrep); find is `fd`. Never reach for `grep`/`find` first — they are error-only fallbacks.

### GitHub issues
- Repo has gh issues → check related, cover acceptance criteria, state deviations. Flow: [docs/agent-hygiene.md](docs/agent-hygiene.md). Failure classes: [docs/issue-classes.md](docs/issue-classes.md).

## Scoped rule sets
- [docs/change-discipline.md](docs/change-discipline.md) — ponytail ladder, root-cause fixes, deployment constraints
- [docs/agent-hygiene.md](docs/agent-hygiene.md) — toolchain pins, edit anchors, issue/commit discipline
- [docs/issue-classes.md](docs/issue-classes.md) — failure-class catalog (secrets, auth, HTTP, CI, tests)
- [docs/security.md](docs/security.md) — ask-list, secrets, git protections
- [docs/portability.md](docs/portability.md) — macOS+Linux shell subset, no absolute user paths
- [docs/tooling-defaults.md](docs/tooling-defaults.md) — Rust-first: piread/piedit/pidx, rg/fd, fallback etiquette
- [docs/token-economy.md](docs/token-economy.md) — read/run discipline, batching, session budget
- [docs/workflow.md](docs/workflow.md) — TDD, plan/do/verify cadence, session length
