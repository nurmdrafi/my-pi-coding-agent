# Tooling Defaults

Rust tools first at every layer; non-Rust fallbacks only on error.

## Order of preference

1. Native Rust pi tools: `piread` (text reads), `piedit` (text edits), `pibash` (shell execution), `pidx` (session-log indexing). Built-in `read` on a text file is blocked (gate P1); built-in `edit` is unused while piedit is registered (`PI_NATIVE_EDIT=0` disables); built-in `bash` is blocked while pibash is registered (gate P2 — pibash runs the same schema and bash-kind gate rules and falls back to the built-in executor itself; `PI_NATIVE_BASH=0` disables pibash and restores `bash`).
2. Rust CLIs: `rg` (ripgrep) for search, `fd` for file find. `grep`/`egrep`/`fgrep`/`find` only when the Rust tool is missing or errored — say so in chat and wait for approval first (gate SS2 enforces this).
3. Built-in tools only for what the above don't cover (images via built-in `read`).

## piread / piedit / pibash contracts

- `piread {path, offset, limit}` — falls back to the built-in reader by itself (missing binary, binary/image content); never fall back manually. A returned window over 300 lines / 8KB is capped (gate H1b, head kept + spill pointer), and a whole-file-ish first read of a file over 24KB is blocked (R1b) — read a targeted window.
- `piedit {path, edits: [{oldText, newText}]}` — exact anchors, same contract as `edit` (byte-identical errors/results, edit-kind gate protection); native match→apply→write→diff pipeline; every failure falls back to the built-in editor automatically — never fall back manually.
- `pibash {command, timeout}` — the default shell tool, same standing as piread/piedit. Runs the native pipeline with full built-in bash semantics (env/PI_* injection, truncation/spill, streaming, cancellation) and falls back to the built-in bash executor automatically on any pipeline failure — never fall back manually. Output is capped to 40 lines / 2KB (gate H1), so keep commands targeted.

## Codemode

Off by default. Declaring `codemode` in `defaultTools` costs ~426 tokens of prefix every turn (schema + `codemode.inlineBudget`), so enable it only when a session needs scripted aggregation.

Use it for scripted aggregation — several nested calls returning one compact digest (multi-file counts, cross-file search, joins) so the raw reads never enter context. Measured win: a raw-read aggregation task cost ~13.9K input tokens without codemode vs ~0.8K with it. One shell command or one file read → `pibash`/`piread` directly; ~47% of historical scripts were just a bash wrapper.

Inside a codemode script the same defaults hold: call `tools.pibash`, `tools.piread`, `tools.piedit`, `tools.pidx` — never `tools.bash`/`tools.read`/`tools.edit` (gate P3 blocks the built-in bash/read names in script source; the rule fires only while that native tool is registered).

The sandbox has no ambient globals and no built-in bash/read/edit — `defaultTools` removes them — so a guessed name fails at dispatch (`ReferenceError: read is not defined`, `tools.bash does not exist`) before any work happens. Read `ALL_TOOLS` (or `searchTools(query)` / `describeTool(name)`) instead of assuming a name. With codemode undeclared the whole tool surface is `piread`, `pibash`, `piedit`, `pidx`, `write`.

Script correctness (gate P4): a codemode script is an async function body and must parse before a single tool runs. The gate compiles it first and blocks a non-parsing script with a `line:col` pointer instead of spending a turn on an opaque sandbox `SyntaxError`. The recurring cause is escaping inside template/string literals — a stray backtick closes a template early, an over-escaped quote (`\"`, `\\`) ends a string before you meant to. Build long shell commands as plain strings with `JSON.stringify` for values, never nest quote layers, never paste a shell heredoc through a JS template unescaped. Past a screenful, write the script to a `.js` file and read it back.

Visible set: `defaultTools: ["-read", "-bash", "-edit"]` keeps `write` and drops the three built-ins the native tools replace. Unlike P1/P2, no gate rule blocks built-in `edit`, so dropping it is a visibility choice, not an enforced block. If a native tool is opted out (`PI_NATIVE_READ=0` / `PI_NATIVE_EDIT=0` / `PI_NATIVE_BASH=0`), re-add the matching built-in to `defaultTools` or that capability is stranded — with both `-edit` and `PI_NATIVE_EDIT=0` the only way to change an existing file is a full-file `write` overwrite.

Run codemode with `"mode": "on"`, not `"only"`: with `"only"` the model sees codemode alone and falls back to built-in names it already knows, which P3 then blocks. `codemode.inlineBudget` caps the per-tool sections inlined into the codemode description (a static per-request cost) — keep it low (`400`, not the `3000` default), since `ALL_TOOLS`/`searchTools` discover the rest on demand.

## Search discipline

- Reach for `rg` first, every time — `grep` is not an alternative spelling for it. Never reach for `grep`/`find` first; they are error-only fallbacks (see §2).
- Never run a repo-wide `rg`/`grep` with no path and a broad pattern — scope to a path or add a timeout.
- Don't rebuild CLIs the system already has (`rg`, `fd`, `jq`); built-in tools cover simple file ops.
