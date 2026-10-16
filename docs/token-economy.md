# Token Economy

## Reads and runs

- Scope reads: open only files the task names or that directly implement/reference the target. Never open `node_modules`, lockfiles, unrelated docs, git history or adjacent modules "for context" — `rg -n` the symbol first, read the hit only. Stop at the located target; extra evidence needs a symptom-tied reason.
- Big read: unfamiliar file → `rg -n 'pattern' <file> -A10` first, then the hit regions only (offset/limit ≤500 lines).
- Whole-file reads over 24 KB are gated; the block reason carries the fix.
- Never re-read a window already in context this session — offset past it. Legitimate after compaction.
- Never re-run an identical command within 10 min without an intervening edit/write — the output is already in context.
- Never re-send a blocked call verbatim — apply the block-reason fix.

## Calls and output

- Batch independent calls into one turn; every turn re-bills the prefix. Self-check before each turn: "could this call have run in the previous turn?" If yes, and no dependency blocked it, it was a wasted turn.
- Pipe raw payloads through `jq` to `/tmp`, never into context; bash output caps at 40 lines / 2KB (oversize → pgate-spill; reads spill on offset/limit).
- Read cap (H1b): a `read`/`piread` result over 300 lines / 8KB is truncated to its head and the full text spilled to `$TMPDIR/pgate-spill` — request a tighter window instead of one wide read.

## Tests

- Test the narrowest target once; read the failure, fix, verify once. Never the full suite — husky gates commits.
- Baseline: first verify run → `/tmp/<repo>-baseline.log`; diff later runs against it.

## Budget and replies

- Budget: a multi-step task costs several× a single-file edit; don't start one under a tight cap.
- Timebox verification: more than 3 tool calls on one acceptance criterion without a conclusion → stop, report interim, ask to continue.
- Land: near the cap → patch first, summary second. An exhausted budget cuts prose, not code.
- Reply terse; never restate file contents, output or diffs in prose — cite path:line.

## Native tooling

- `pidx` (Rust, `custom-tools/pidx/`, binary at `bin/pidx`): incremental session-log indexer feeding session-audit's L0 fast path; Node fallback automatic if the binary is missing. Usage rules: [tooling-defaults.md](tooling-defaults.md).
- Future native tools follow the pidx bar: measured bottleneck, benchmark numbers in hand (`docs/specs/`), user approves, parity gate against the JS path it replaces.

## Extensions and sessions

- Load extensions per project, never globally (they re-bill the prompt every turn); exception: permission-gate, the enforcement layer itself.
- Release work: each concern (version bump, changelog, issue close) gets its own short session; never chain them into one long session — every turn re-reads the prefix. Session-length thresholds: [workflow.md](workflow.md).
