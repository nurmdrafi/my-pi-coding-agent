# Tooling Defaults

Rust-based tools first at every layer; non-Rust fallbacks only on error.

## Order of preference
1. Native Rust pi tools: `piread` (text reads), `piedit` (text edits), `pibash` (shell execution), `pidx` (session-log indexing). Built-in `read` on a text file is blocked (permission-gate P1); built-in `edit` is unused while piedit is registered (`PI_NATIVE_EDIT=0` disables); built-in `bash` is blocked while pibash is registered (permission-gate P2 — pibash runs the same schema and bash-kind gate rules and falls back to the built-in executor itself; `PI_NATIVE_BASH=0` disables pibash and restores `bash`).
2. Rust CLIs: `rg` (ripgrep) for search, `fd` for file find. `grep`/`egrep`/`fgrep`/`find` only when the Rust tool is missing or errored — say so in chat and wait for approval first (permission-gate SS2 enforces this).
3. Built-in tools only for what the above don't cover (images via built-in `read`).

## piread / piedit / pibash contracts
- `piread {path, offset, limit}` — falls back to the built-in reader by itself (missing binary, binary/image content); never fall back manually. A returned window over 300 lines / 8KB is capped (gate H1b, head kept + spill pointer), and a whole-file-ish first read of a >24KB file is blocked (R1b) — read a targeted window.
- `piedit {path, edits: [{oldText, newText}]}` — exact anchors, same contract as `edit` (byte-identical errors/results, permission-gate edit-kind protection); native match→apply→write→diff pipeline; every failure falls back to the built-in editor automatically — never fall back manually.
- `pibash {command, timeout}` — the default shell tool, same standing as piread/piedit. Runs through the native pipeline with full built-in bash semantics (env/PI_* injection, truncation/spill, streaming, cancellation) and falls back to the built-in bash executor automatically on any pipeline failure — never fall back manually. Its output is capped to 40 lines / 2KB (gate H1), so keep commands targeted.

## Codemode scripts
Use codemode when a task needs **scripted aggregation** — running several nested calls and returning one compact digest (multi-file counts, cross-file search, joins) so the raw reads never enter context. That is its measured win: an A/B session showed a raw-read aggregation task at ~13.9K input tokens without codemode vs ~0.8K with it. For a single shell command or a single file read, call `pibash`/`piread` directly — codemode adds a turn and a schema tax, and ~47% of historical scripts were just a bash wrapper.

Inside a codemode script the same defaults hold: call `tools.pibash`, `tools.piread`, `tools.piedit`, `tools.pidx` — never `tools.bash`/`tools.read`/`tools.edit` (permission-gate P3 blocks the built-in bash/read names in script source; the rule only fires while the native tool is registered).

**Discover names before using them.** The sandbox has no ambient globals and no built-in bash/read/edit — `defaultTools` removes them — so a guessed name fails at dispatch (`ReferenceError: read is not defined`, `tools.bash does not exist`) before any work happens. The complete callable set here is `pibash`, `pidx`, `piedit`, `piread`, `write`. Read `ALL_TOOLS` (or `searchTools(query)` / `describeTool(name)`) rather than assuming a name; `write` is the only built-in tool that still exists.

**Script correctness (permission-gate P4).** A codemode script is an async function body, so it must parse before a single tool runs. The gate compiles it first and blocks a non-parsing script with a `line:col` pointer instead of spending a turn on an opaque sandbox `SyntaxError`. The recurring cause is escaping inside template/string literals: a stray backtick closes a template early, and an over-escaped quote (`\"`, `\\`) terminates a string before you meant to. Keep the script simple — build long shell commands as plain strings with `JSON.stringify` for values rather than nesting quote layers, and never paste a shell heredoc through a JS template unescaped. When a script grows past a screenful, write it to a `.js` file and read it back rather than re-sending a huge escaping-prone blob.

Tool visibility also matters: settings.json must declare the native tools (`defaultTools: ["-bash","-read","-edit","+codemode","+pibash","+piread","+piedit","+pidx"]`) and run codemode with `"mode": "on"` (not `"only"`). With `"only"` the model sees codemode alone and falls back to built-in names it already knows, which P3 then blocks.

The codemode tool description inlines a section per callable tool, capped by `codemode.inlineBudget` — a STATIC cost paid on every request, not just when a script runs. Keep it low (`1200`, not the `3000` default): `ALL_TOOLS` / `searchTools` discover the rest on demand, and every inlined section is duplicated per-turn input. Each native tool's codemode guideline is deliberately one short line for the same reason — the "check ALL_TOOLS first" advice lives once in codemode's own globals list, not repeated on every tool.

`-bash`/`-read`/`-edit` drop the three built-ins the native tools replace, so the declared set is exactly what the harness expects (`write`, codemode, and the four natives). Caveat: unlike P1/P2 there is no gate rule blocking built-in `edit`, so removing it is a visibility choice, not an enforced block. If you opt a native tool out (`PI_NATIVE_READ=0` / `PI_NATIVE_EDIT=0` / `PI_NATIVE_BASH=0`), re-add the matching built-in to `defaultTools` or that capability is stranded — with both `-edit` and `PI_NATIVE_EDIT=0` the only way to change an existing file is a full-file `write` overwrite.

## Search discipline
- Reach for `rg` first, every time — `grep` is not an alternative spelling for it. Never reach for `grep`/`find` first; they are error-only fallbacks (see §2).
- Never repo-wide `rg`/`grep` with no path + broad pattern — scope to a path or add a timeout.
- Don't rebuild CLIs the system already has (`rg`, `fd`, `jq`); built-in tools cover simple file ops.
