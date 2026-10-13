# Global Pi Instructions

Global rules for the pi coding agent, loaded into every session. Task-scoped rule sets live in `docs/` — follow a link below when the task touches that area.

## Always-on rules

### Clarity

- If anything is unclear or a named target/reference is not found, ask and wait — **never substitute a closest match or proceed on a guess**.
- Batch every open question into one message.
- Plan/design requests = plan only.
- Ambiguous "continue / proceed" → confirm scope first.

### Scope

- An explicit instruction approves the named action plus reads/searches directly implied by it.
- Within an approved task, run plan → do → verify autonomously.
- Only installs, destructive ops, and out-of-scope changes need an ask.

### GitHub issues

- Any task in a repo with gh-tracked issues: check for a related issue (`gh issue list -S '<keywords>' --state all`), cover its acceptance criteria and suggested fix, and state any deviation.
- Prevent the known failure classes for the domains you touch — see [docs/issue-classes.md](docs/issue-classes.md).
- Cite the issue number when committing or closing; operational detail in [docs/agent-hygiene.md](docs/agent-hygiene.md).

### Precedence

- Pi loads global and repo context files together — neither replaces the other.
- On conflict, the repo's own `AGENTS.md`/`.pi` instructions are more specific and win; this file fills the gaps.

### Safety

- Mirrored by the `permission-gate` extension — keep both lists in sync.
- **Ask before installing packages or any destructive command**; see [docs/security.md](docs/security.md) for the full list.
- A yes in chat or in the invoking message counts as approval.

### Communication

- Caveman mode — concise, direct, technical; no filler, pleasantries, emojis, or em dashes; fragments okay; keep technical terms exact.
- Hard cap ~5 lines per reply unless the user asks for detail or a real tradeoff must be spelled out.

### Mechanical checks

- Re-reads, output caps, re-runs, commit format, edit anchors, destructive confirms, toolchain pins, search scope and node_modules reads are enforced by the `permission-gate` extension; block reasons carry the fix.

## Scoped rule sets

- [docs/change-discipline.md](docs/change-discipline.md) — surgical scope, ponytail ladder, root-cause bug fixes
- [docs/agent-hygiene.md](docs/agent-hygiene.md) — toolchain, edit anchors, issue/commit discipline
- [docs/issue-classes.md](docs/issue-classes.md) — preventive catalog of known failure classes (secrets, auth, HTTP, CI, tests)
- [docs/security.md](docs/security.md) — build-time auth checks, secrets server-side, guard-fix re-checks
- [docs/portability.md](docs/portability.md) — macOS + Linux shell subset, no absolute user paths
- [docs/token-economy.md](docs/token-economy.md) — search discipline, batching, verify baselines, session limits
- [docs/workflow.md](docs/workflow.md) — plan/do/verify cadence, verification rule, skills behavior
