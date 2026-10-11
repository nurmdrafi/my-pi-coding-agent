# Token Economy

Guidance only — re-reads, re-runs, and output caps are mechanically enforced by the permission-gate extension.

- Search with `rg` (capped) / `jq`; symbol-outline unfamiliar code first.
- Each turn re-sends the whole prefix: batch independent commands and tool calls into one turn; no speculative status checks; at ~80% identified, batch search-then-act.
- Locate before read: `rg -n 'pattern' <file> -A10` before any full-file read; full read only when the edit needs whole-file structure.
- Batch verify: one bash call = typecheck + file-scoped lint. First run writes the error baseline to `/tmp/<repo>-baseline.log`; later runs diff against it — no re-derivation.
- Curl through jq: `curl … | jq '.data[0], .meta'`; full payloads go to `/tmp`, never raw into context.
- Past ~150K context or ~200 turns → propose a fresh session (compaction or handoff).
