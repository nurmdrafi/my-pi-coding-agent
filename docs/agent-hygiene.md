# Agent Hygiene

Toolchain, edits, issue/commit rules. Loaded via AGENTS.md link.

## Toolchain
- Activate repo-pinned Node/pkg manager before any command (`.nvmrc`/`packageManager`).
- `Unsupported engine` error = skipped pin; switch, re-run.
- Repo pkg manager only (`pnpm exec` in pnpm repo); never `npx`/`npm` against it.
- Never read `node_modules`.
- Never repo-wide `grep`/`rg` with no path + broad pattern — scope or timeout.
- TC1/TC2, SS1, PB1, NM1 enforced by permission-gate; block reason = stop, not retry differently.

## Edits
- Re-read exact region immediately before editing.
- Never reuse anchor captured before intervening edit.
- `Anchor Guard` → read region, re-anchor; never retry same `oldText`.
- No-op edit (`identical content`) → stop, re-read.

## Issues and commits
- Before fixing: read acceptance criteria + suggested fix; cover every criterion, state deviations.
- Issue flow: `gh issue view N` once, one duplicate search (`gh issue list -S`), then fix. No re-fetch, no repeat searches.
- One issue comment per commit, quoting short SHA; edit existing comment, never post second.
- Never close issue for uncommitted/unpushed work; close only after push.
- Commit bodies ≤100 chars/line; pass commitlint (`type(scope): subject`) before committing.
- Hook reject → fix cause once; never re-issue with altered quoting.
- Install ≠ verification; gate rejection = stop, not retry differently.
