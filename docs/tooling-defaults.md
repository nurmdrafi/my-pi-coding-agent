# Tooling Defaults

Rust-based tools first at every layer; non-Rust fallbacks only on error.

## Order of preference
1. Native Rust pi tools: `piread` (text reads), `piedit` (text edits), `pibash` (shell execution), `pidx` (session-log indexing). Built-in `read` on a text file is blocked (permission-gate P1); built-in `edit` is unused while piedit is registered (`PI_NATIVE_EDIT=0` disables); built-in `bash` is the fallback while pibash is registered (`PI_NATIVE_BASH=0` disables).
2. Rust CLIs: `rg` (ripgrep) for search, `fd` for file find. `grep`/`egrep`/`fgrep`/`find` only when the Rust tool is missing or errored — say so in chat and wait for approval first (permission-gate SS2 enforces this).
3. Built-in tools only for what the above don't cover (images via built-in `read`).

## piread / piedit / pibash contracts
- `piread {path, offset, limit}` — falls back to the built-in reader by itself (missing binary, binary/image content); never fall back manually.
- `piedit {path, edits: [{oldText, newText}]}` — exact anchors, same contract as `edit` (byte-identical errors/results, permission-gate edit-kind protection); native match→apply→write→diff pipeline; every failure falls back to the built-in editor automatically — never fall back manually.
- `pibash {command, timeout}` — the default shell tool, same standing as piread/piedit. Runs through the native pipeline with full built-in bash semantics (env/PI_* injection, truncation/spill, streaming, cancellation) and falls back to the built-in bash executor automatically on any pipeline failure — never fall back manually.

## Search discipline
- Reach for `rg` first, every time — `grep` is not an alternative spelling for it. Never reach for `grep`/`find` first; they are error-only fallbacks (see §2).
- Never repo-wide `rg`/`grep` with no path + broad pattern — scope to a path or add a timeout.
- Don't rebuild CLIs the system already has (`rg`, `fd`, `jq`); built-in tools cover simple file ops.
