# Token Economy

## Reads and runs

- Big read: unfamiliar file — `rg -n 'pattern' <file> -A10` first, then read only the hit regions (offset/limit ≤ 500 lines).
- Whole-file reads of >24 KB files are gated; the block reason carries the fix.
- Re-read: never re-read a window already in context this session (reads/edits/writes/@files cover it) — offset past it. Legitimate again after compaction.
- Re-run: never re-run an identical command within 10 min without an intervening edit/write — its output is already in context.
- Re-block: never re-send a blocked call verbatim — apply the fix stated in the block reason.

## Calls and output

- Batch: all independent commands/tool calls in one turn; every turn re-bills the full prefix.
- Pipe: raw payloads through `jq` into `/tmp`, never into context; bash output caps at 100 lines / 4 KB anyway (oversize spills to pgate-spill — read spills with offset/limit).

## Tests

- Test: narrowest target once (`npm test -- <file>`); read the failure block, fix, verify once — no full-suite runs during iteration.
- Baseline: first verify run → `/tmp/<repo>-baseline.log`; diff every later run against it.

## Budget and replies

- Budget: multi-step tasks cost several× a single-file edit; don't start one under a tight token cap.
- Land: near a token cap, ship the patch first, summary second — exhausted budgets cut prose, not code.
- Reply: terse; never restate file contents, command output, or diffs in prose — cite path:line.

## Extensions and sessions

- Load: extensions per project, never globally (each re-bills its prompt every turn); sole exception: permission-gate, the enforcement layer itself.
- Cadence: at ~200 user turns or ~150K context tokens, propose compaction or a fresh session — prefix size, not turn count, dominates cost.
