# Tool reference — CDP browser scripts

Chrome DevTools Protocol tools for agent-assisted web automation. These tools
connect to Chrome running on `:9222` with remote debugging enabled. Works on
macOS and Linux. `{baseDir}` is this skill's root.

## Setup

Run once before first use (deps are not committed):

```bash
cd {baseDir}   # package.json sits at the skill root
npm install
```

Pre-flight before any session: `node_modules` exists in `{baseDir}`, the dev
server is reachable (`curl -sf localhost:PORT`), and `:9222` is not already
taken by another debug Chrome instance.

## Start Chrome

```bash
{baseDir}/scripts/browser-start.js              # Fresh profile
{baseDir}/scripts/browser-start.js --profile    # Copy user's profile (cookies, logins)
CHROME_PATH=/path/to/chrome {baseDir}/scripts/browser-start.js   # Explicit executable
```

Launch Chrome with remote debugging on `:9222`. Chrome is auto-detected per OS
(macOS: `/Applications`, Linux: `google-chrome`/`chromium`/snap); override with
`CHROME_PATH` if detection fails.

Fresh vs `--profile`:
- **Fresh (default)** — clean, reproducible state; use whenever the task
  doesn't need the developer's logins.
- **`--profile`** — only when the target requires the user's auth/cookies.
  Costs: extensions, service workers, stale caches and other profile state can
  interfere. Never assert through `--profile` state when reproducibility
  matters — record a `storageState` instead and feed it to Playwright.

## Navigate

```bash
{baseDir}/scripts/browser-nav.js https://example.com
{baseDir}/scripts/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing
current tab.

## Evaluate JavaScript

```bash
{baseDir}/scripts/browser-eval.js 'document.title'
{baseDir}/scripts/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to
extract data, inspect page state, or perform DOM operations programmatically.

## Screenshot

```bash
{baseDir}/scripts/browser-screenshot.js
```

Capture current viewport and return temporary file path. Use this to visually
inspect page state or verify UI changes.

## Pick Elements

```bash
{baseDir}/scripts/browser-pick.js "Click the submit button"
```

Use when the user wants to select specific DOM elements on the page. Launches
an interactive picker that lets the user click elements to select them. The
user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done.
The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → use this tool to let them select it
- User says "extract data from these items" → use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
{baseDir}/scripts/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and
secure flags. Use this to debug authentication issues or inspect session state.

## Extract Page Content

```bash
{baseDir}/scripts/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla
Readability for article extraction and Turndown for HTML-to-markdown
conversion. Works on pages with JavaScript content (waits for page to load).
For static pages `{baseDir}/scripts/web-fetch.mjs <url> <maxChars>` is the
cheapest extractor (headless, capped, no quota). Never this skill for research.
