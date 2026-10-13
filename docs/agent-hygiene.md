# Agent Hygiene

Process rules for toolchain, edits, and issue/commit handling. Loaded via the AGENTS.md link.

## Toolchain

- Activate the repo's pinned Node/package manager before any command (`.nvmrc` / `packageManager`).
- `Unsupported engine: wanted "X" (current "Y")` means you skipped it — switch, then re-run.
- Use the repo's package manager (`pnpm exec` in a pnpm repo), never `npx`/`npm` against it.
- Never read `node_modules`.
- Never run repo-wide `grep`/`rg` with no path and a broad pattern — scope it or it times out.
- TC1/TC2 (package manager + Node pin), SS1 (search scope), PB1 (`grep -P`), NM1 (`node_modules`) are mechanically enforced by `permission-gate`; a block reason is a stop, not an obstacle to retry differently.

## Edits

- Re-read the exact region immediately before editing.
- Never reuse an anchor captured before an intervening edit.
- On `Anchor Guard`, read the region and re-anchor — do not retry the same `oldText`.
- A no-op edit (`No changes made … identical content`) means stop and re-read.

## Issues and commits

- Before fixing, read the issue's acceptance criteria and suggested fix; cover every criterion and state any deviation.
- Issue flow: `gh issue view N` once, one `gh issue list -S` duplicate search, then fix.
- Don't re-fetch the same issue or repeat searches.
- One issue comment per commit, quoting the short SHA; edit the existing comment instead of posting a second.
- Never close an issue for uncommitted/unpushed work; close only after the fix is pushed.
- Commit bodies wrap at ≤100 chars and must pass commitlint (`type(scope): subject`) before committing.
- On a hook reject, fix the cause once — never re-issue the command with altered quoting.
- An install is never a verification step; a gate rejection is a stop, not an obstacle to retry differently.
