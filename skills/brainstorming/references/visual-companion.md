# Visual Companion Guide

Browser-based visual brainstorming companion: mockups, diagrams, options.

## When to use

Decide per-question, not per-session. Test: **would user understand better by seeing than reading?**

Browser when content itself visual:

- UI mockups — wireframes, layouts, navigation structures, component designs
- Architecture diagrams — components, data flow, relationship maps
- Side-by-side visual comparisons — two layouts, two color schemes, two directions
- Design polish — look and feel, spacing, visual hierarchy
- Spatial relationships — state machines, flowcharts, ER diagrams

Terminal when text/tabular:

- Requirements/scope — "what does X mean?", "which features in scope?"
- Conceptual A/B/C choices — approaches described in words
- Tradeoff lists — pros/cons, comparison tables
- Technical decisions — API design, data modeling, architecture selection
- Clarifying questions — answer is words, not visual preference

UI topic ≠ automatically visual question. "What kind of wizard do you want?" = conceptual → terminal. "Which wizard layout feels right?" = visual → browser.

## How it works

Server watches a directory for HTML files, serves newest to browser. Write HTML to `screen_dir`; user sees it in browser, clicks to select options. Selections recorded to `state_dir/events`, read on next turn.

Content fragments vs full documents: HTML starting `<!DOCTYPE`/`<html` → served as-is (helper script injected). Otherwise auto-wrapped in frame template — header, CSS theme, connection status, interactive infrastructure. **Fragments by default.** Full documents only for complete page control.

## Starting a session

```bash
# AFTER user approves companion. --open auto-opens browser on first screen;
# --project-dir persists mockups + enables same-port restart.
scripts/start-server.sh --project-dir /path/to/project --open

# Returns: {"type":"server-started","port":52341,
#           "url":"http://localhost:52341/?key=ab12…",
#           "screen_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000/content",
#           "state_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000/state"}
```

Save `screen_dir` + `state_dir`. With `--open`, browser opens itself on first screen — still share URL as fallback (headless/remote won't auto-open).

**URL contains session key (`?key=…`).** Server rejects keyless requests — always give user the **complete** URL from `url` field; never strip query string, never bare `http://host:port`. Key gates HTTP + WebSocket so stray tab or network machine can't read screens/inject events. After first load browser remembers key via cookie; reloads + `/files/*` assets work without repeating.

Connection info: startup JSON written to `$STATE_DIR/server-info`. Background launch without captured stdout → read that file for URL/port. With `--project-dir`: check `<project>/.superpowers/brainstorm/` for session dir.

Note: pass project root as `--project-dir` so mockups persist in `.superpowers/brainstorm/`, survive restarts. Without it → `/tmp`, cleaned up. Remind user to add `.superpowers/` to `.gitignore`.

### Launching by platform

- Claude Code: default mode works — script backgrounds the server itself. Windows: auto-detects, switches foreground (blocks tool call) → `run_in_background: true` so server survives turns, then read `$STATE_DIR/server-info` next turn.
- Codex: reaps background processes. Script auto-detects `CODEX_CI`, switches foreground. Run normally.
- Copilot CLI: `--foreground` + start via bash tool with `mode: "async"` so process survives turns; capture `shellId` for `read_bash`/`stop_bash`.
- Other environments: server must keep running across turns. Environment reaps detached processes → `--foreground` + platform's background mechanism.

URL unreachable from browser (remote/containerized) → bind non-loopback:

```bash
scripts/start-server.sh \
  --project-dir /path/to/project \
  --host 0.0.0.0 \
  --url-host localhost
```

`--url-host` controls hostname printed in returned URL JSON.

## The loop

1. Check server alive, then write HTML to new file in `screen_dir`:
   - **Confirm alive before referring to URL or pushing screen**: `$STATE_DIR/server-info` exists AND `$STATE_DIR/server-stopped` doesn't. Shut down → restart with `start-server.sh` + **same `--project-dir`** — reuses same port, user's open tab reconnects itself ("paused" overlay while down), no new URL needed. Server auto-exits after 4 h idle (`--idle-timeout-minutes` configurable).
   - Semantic filenames: `platform.html`, `visual-style.html`, `layout.html`
   - **Never reuse filenames** — fresh file per screen
   - File-creation tool — **never cat/heredoc** (dumps terminal noise)
   - Server serves newest file automatically
2. Tell user what to expect, end turn:
   - Remind URL (every step, not just first)
   - Brief text summary of screen ("Showing 3 layout options for the homepage")
   - Ask terminal response: "Take a look and let me know what you think. Click to select an option if you'd like."
3. Next turn — after user responds in terminal:
   - Read `$STATE_DIR/events` if exists — browser interactions (clicks, selections) as JSON lines
   - Merge with terminal text — terminal message = primary feedback; `events` = structured interaction data
4. Iterate or advance — feedback changes current screen → new file (`layout-v2.html`). Next question only after current step validated.
5. Unload when returning to terminal — next step needs no browser (clarifying question, tradeoff discussion) → push waiting screen clearing stale content:

   ```html
   <!-- filename: waiting.html (or waiting-2.html) -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">Continuing in terminal...</p>
   </div>
   ```

   Prevents user staring at resolved choice while conversation moved on. Next visual question → new content file as usual.
6. Repeat until done.

## Writing content fragments

Just the content inside the page; server wraps in frame template (header, theme CSS, connection status, interactive infrastructure).

Minimal example:

```html
<h2>Which layout works better?</h2>
<p class="subtitle">Consider readability and visual hierarchy</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Single Column</h3>
      <p>Clean, focused reading experience</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>Two Column</h3>
      <p>Sidebar navigation with main content</p>
    </div>
  </div>
</div>
```

No `<html>`, no CSS, no `<script>` needed — server provides all.

## CSS classes available (frame template)

### Options (A/B/C choices)

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>Title</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

Multi-select: `data-multiselect` on container — each click toggles selected styling.

```html
<div class="options" data-multiselect>
  <!-- same option markup — users select/deselect multiple -->
</div>
```

### Cards (visual designs)

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup content --></div>
    <div class="card-body">
      <h3>Name</h3>
      <p>Description</p>
    </div>
  </div>
</div>
```

### Mockup container

```html
<div class="mockup">
  <div class="mockup-header">Preview: Dashboard Layout</div>
  <div class="mockup-body"><!-- your mockup HTML --></div>
</div>
```

### Split view (side-by-side)

```html
<div class="split">
  <div class="mockup"><!-- left --></div>
  <div class="mockup"><!-- right --></div>
</div>
```

### Pros/cons

```html
<div class="pros-cons">
  <div class="pros"><h4>Pros</h4><ul><li>Benefit</li></ul></div>
  <div class="cons"><h4>Cons</h4><ul><li>Drawback</li></ul></div>
</div>
```

### Mock elements (wireframe blocks)

```html
<div class="mock-nav">Logo | Home | About | Contact</div>
<div style="display: flex;">
  <div class="mock-sidebar">Navigation</div>
  <div class="mock-content">Main content area</div>
</div>
<button class="mock-button">Action Button</button>
<input class="mock-input" placeholder="Input field">
<div class="placeholder">Placeholder area</div>
```

### Typography + sections

- `h2` page title · `h3` section heading · `.subtitle` secondary text · `.section` content block with bottom margin · `.label` small uppercase label

## Browser events format

Clicks recorded to `$STATE_DIR/events` (one JSON object/line). File auto-cleared when new screen pushed.

```jsonl
{"type":"click","choice":"a","text":"Option A - Simple Layout","timestamp":1706000101}
{"type":"click","choice":"c","text":"Option C - Complex Grid","timestamp":1706000108}
{"type":"click","choice":"b","text":"Option B - Hybrid","timestamp":1706000115}
```

Full stream shows exploration path — user may click multiple options before settling. Last `choice` event = typically final selection; click pattern can reveal hesitation/preferences worth asking about.

`$STATE_DIR/events` doesn't exist → no browser interaction; use terminal text only.

## Design tips

- Scale fidelity to question — wireframes for layout, polish for polish questions
- Real content when it matters — photography portfolio → actual images (Unsplash). Placeholder content obscures design issues.
- Keep mockups simple — layout + structure, not pixel-perfect

## File naming

- Semantic names: `platform.html`, `visual-style.html`, `layout.html`
- Never reuse filenames — each screen a new file
- Iterations: version suffix `layout-v2.html`, `layout-v3.html`
- Server serves newest by modification time

## Cleaning up

```bash
scripts/stop-server.sh $SESSION_DIR
```

`--project-dir` session → mockups persist in `.superpowers/brainstorm/`. Only `/tmp` sessions deleted on stop.

## Reference

- Frame template (CSS reference): `scripts/frame-template.html`
- Helper script (client-side): `scripts/helper.js`
