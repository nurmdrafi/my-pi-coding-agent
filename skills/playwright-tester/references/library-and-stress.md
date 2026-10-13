# Library/SDK e2e, update-flow stress, debugging a FAIL

Read when target is a library not an app, when stress-testing update flows, or when a run fails.

## Library / SDK e2e

- Case registry: one small case per documented feature, served at `?case=<id>` by tiny host app; specs only navigate + assert. Case index page so humans click through every scenario — suite must run without an agent.
- Run vs built artifact, verify resolution: host app aliases package name to `dist/` — suite once silently tested installed npm copy while build sat untested. Verify alias resolves; rebuild before e2e after library changes.
- Host app imports every published entry point (main, `./styles`, subpaths) + uses app's real env mechanism (`.env`) — no invented `window.__*__` globals.
- Permanent page-error recorder before app code (`window.__pageErrors__`) — blank page with no dev overlay otherwise undiagnosable.
- Consult mature upstream reference repo BEFORE authoring specs (suite written against guessed idioms was rewritten after user redirect); `rg` target repo for existing helpers before writing new.

## Update-flow stress pattern (per iteration)

1. Baseline — fetch record via `apiGet` in connected tab: same origin, same token app uses; never separate HTTP client.
2. Mutate — drive UI, real timing.
3. UI-wipe check — assert form still shows typed value right before save (catches async re-seed races silently reverting edits).
4. Save.
5. Crosscheck — `diffRec(before, after, [...edits, ...serverFields])`: every field NOT edited must equal baseline. Screenshot every failure.
6. Report row — pattern, edits, field diffs, uiWipe flag, duration; timestamped files (`report-<stamp>.json/.md`) so stale reports never read fresh.

Pattern matrix:
- no-edit-save
- single-field
- rapid multi-field
- toggle-only
- cancel-reopen
- async-race (save before full record arrives)
- cross-wipe (edit A → assert B survives).

All pass → add harder patterns, never repeat.

Lessons that keep paying:
- auth self-heal (retry once on 401 after `refreshAuth`)
- parse JSON-string blobs before compare/spread (spreading a string seeds nothing silently)
- `Record<string, unknown>` for API payloads (`object` fails tsc)
- `workers: 1` for shared state
- fail-fast errors including exact relaunch command
- server-derived fields in diff ignore list.

## Debugging a FAIL

- Report row first: `uiWipe: true` → UI race (form re-seed / `resetFields` on async arrival). Field diffs only → payload bug: capture submit request via `page.on("request")`, compare sent vs intended.
- Reuse on-disk artifacts before re-running: failure traces, screenshots, saved run logs often answer with zero execution.
- After fix, re-run ONLY failing spec(s) (`npx playwright test spec.ts -g "name"`) before any full suite.
- One unexplained failure → go live with `browser-tools` replay instead of more log-guessing (hours of log analysis once settled in minutes of live replay).
