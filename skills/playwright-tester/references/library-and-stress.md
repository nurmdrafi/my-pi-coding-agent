# Library/SDK e2e, update-flow stress, debugging a FAIL

Read when the target is a library rather than an app, when stress-testing
update flows, or when a run fails. Moved verbatim from the SKILL.md body.

## Library / SDK e2e

When the target is a library, not an app:

- **Case registry**: one small case per documented feature, served at `?case=<id>` by a
  tiny host app; specs only navigate + assert. Add a case index page so humans click
  through every scenario — the suite must run without an agent.
- **Run against the built artifact and verify resolution**: the host app must alias the
  package name to `dist/` — a suite once silently tested an installed npm copy while the
  build sat untested. Verify the alias actually resolves; rebuild before e2e after
  library changes.
- Host app imports **every published entry point** (main, `./styles`, subpaths) and uses
  the app's real env mechanism (`.env`) — no invented `window.__*__` globals.
- Install a permanent page-error recorder before app code (`window.__pageErrors__`) —
  a blank page with no dev overlay is otherwise undiagnosable.
- Consult a mature upstream reference repo BEFORE authoring specs (a suite written
  against guessed idioms was rewritten after a user redirect); rg the target repo for
  existing helpers before writing new ones.

## Update-flow stress pattern (per iteration)

1. **Baseline** — fetch record via `apiGet` in the connected tab: same origin, same token
   the app uses; never a separate HTTP client.
2. **Mutate** — drive the UI, real timing.
3. **UI-wipe check** — assert the form still shows the typed value right before save
   (catches async re-seed races that silently revert edits).
4. **Save**.
5. **Crosscheck** — `diffRec(before, after, [...edits, ...serverFields])`: every field
   NOT edited must equal baseline. Screenshot every failure.
6. **Report row** — pattern, edits, field diffs, uiWipe flag, duration; timestamped
   files (`report-<stamp>.json/.md`) so stale reports never read as fresh.

Pattern matrix: no-edit-save, single-field, rapid multi-field, toggle-only, cancel-reopen,
async-race (save before full record arrives), cross-wipe (edit A → assert B survives).
When all pass, add harder patterns instead of repeating.

Lessons that keep paying: auth self-heal (retry once on 401 after `refreshAuth`); parse
JSON-string blobs before compare/spread (spreading a string seeds nothing silently);
`Record<string, unknown>` for API payloads (`object` fails tsc); `workers: 1` for shared
state; fail-fast errors that include the exact relaunch command; server-derived fields in
the diff ignore list.

## Debugging a FAIL

- Read the report row first: `uiWipe: true` → UI race (form re-seed / `resetFields` on
  async arrival). Field diffs only → payload bug: capture the submit request via
  `page.on("request")` and compare sent vs intended.
- Reuse on-disk artifacts before re-running: failure traces, screenshots, saved run logs
  often answer with zero execution.
- After a fix, re-run ONLY the failing spec(s) (`npx playwright test spec.ts -g "name"`)
  before any full suite.
- One unexplained failure → go live with `browser-tools` replay instead of more
  log-guessing (hours of log analysis were once settled in minutes of live replay).
