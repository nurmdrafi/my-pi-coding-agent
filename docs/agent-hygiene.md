# Agent Hygiene

Toolchain, edits, issue/commit rules. Loaded via the AGENTS.md link.

## Toolchain

- Activate the repo-pinned Node/package manager before any command (`.nvmrc`/`packageManager`).
- `Unsupported engine` error = skipped pin; switch, re-run.
- Repo package manager only (`pnpm exec` in a pnpm repo); never `npx`/`npm` against it.
- Never read `node_modules`.
- Search/find defaults and fallback etiquette: [tooling-defaults.md](tooling-defaults.md).
- TC1/TC2, SS1, SS2, SS3, PB1, NM1 enforced by permission-gate; block reason = stop, not a different retry.

## Edits

- Re-read a region only when its content is not in context (post-compaction, external change, gate block) — never re-read a window already in context this session. Details: [token-economy.md](token-economy.md).
- Never reuse an anchor captured before an intervening edit; after any edit/write to a file, re-read before re-anchoring.
- `Anchor Guard` → read the region, re-anchor; never retry the same `oldText`.
- No-op edit (`identical content`) → stop, re-read.

## Issues and commits

- Before fixing: read the acceptance criteria + suggested fix; cover every criterion, state deviations.
- Issue flow: `gh issue view N` once, one duplicate search (`gh issue list -S`), then fix. No re-fetch, no repeat searches.
- One issue comment per commit, quoting the short SHA; edit the existing comment, never post a second.
- Never close an issue for uncommitted/unpushed work; close only after push.
- Commit bodies ≤100 chars/line; pass commitlint (`type(scope): subject`) before committing.
- Hook reject → fix the cause once; never re-issue with altered quoting.
- Install ≠ verification; gate rejection = stop, not a different retry.
