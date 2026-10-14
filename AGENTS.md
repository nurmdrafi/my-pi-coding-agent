# Global Pi Instructions

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
- Ask only for: installs, destructive ops, out-of-scope changes.

### GitHub issues
- Repo has gh issues → check related (`gh issue list -S '<keywords>' --state all`), cover acceptance criteria + suggested fix, state deviations.
- Prevent known failure classes for touched domains — [docs/issue-classes.md](docs/issue-classes.md).
- Cite issue number in commits/closes; detail in [docs/agent-hygiene.md](docs/agent-hygiene.md).

### Precedence
- Global + repo context load together; neither replaces other.
- Conflict → repo `AGENTS.md`/`.pi` wins; this file fills gaps.
- Explicit in-session user instruction outranks global/repo/template rules: apply override, one-line deviation note, never relitigate.

### Safety
- Mirrored by `permission-gate` extension — keep lists in sync.
- **Ask before installs, packages, destructive commands** — full list: [docs/security.md](docs/security.md).
- Yes in chat or invoking message = approval.

### Communication
- Telegram style: short complete sentences, plain prose, no fragments/emoji.
- Cap ~5 lines/reply. Interstitial text between tool calls: ≤1 short sentence, interpret-only.
- Only Propose/Report/plan deliverables may exceed the cap.
- Analysis/audit deliverables → dated file under `audit-reports/` + ≤5-line chat summary + path.

### Mechanical checks
- Re-reads, output caps, re-runs, commit format, edit anchors, destructive confirms, toolchain pins, search scope, node_modules reads — enforced by `permission-gate`; block reason carries fix.

## Scoped rule sets
- [docs/change-discipline.md](docs/change-discipline.md) — surgical scope, ponytail ladder, root-cause fixes
- [docs/agent-hygiene.md](docs/agent-hygiene.md) — toolchain, edit anchors, issue/commit discipline
- [docs/issue-classes.md](docs/issue-classes.md) — failure-class catalog (secrets, auth, HTTP, CI, tests)
- [docs/security.md](docs/security.md) — build-time auth checks, secrets server-side, guard-fix re-checks
- [docs/portability.md](docs/portability.md) — macOS+Linux shell subset, no absolute user paths
- [docs/token-economy.md](docs/token-economy.md) — search discipline, batching, baselines, session limits
- [docs/workflow.md](docs/workflow.md) — TDD, plan/do/verify cadence, session length
