# Token Economy

## Reads and runs
- Scope reads: open only files task names or directly implement/reference target. Never open `node_modules`, lockfiles, unrelated docs, git history, adjacent modules "for context" — `rg -n` symbol first, read hit only. Stop at located target; extra evidence needs symptom-tied reason.
- Big read: unfamiliar file — `rg -n 'pattern' <file> -A10` first, then hit regions only (offset/limit ≤500 lines).
- Whole-file reads >24 KB gated; block reason carries fix.
- Re-read: never re-read window already in context this session — offset past. Legitimate after compaction.
- Re-run: never re-run identical command within 10 min without intervening edit/write — output already in context.
- Re-block: never re-send blocked call verbatim — apply block-reason fix.

## Calls and output
- Batch: all independent calls one turn; every turn re-bills prefix.
- Pipe raw payloads through `jq` to `/tmp`, never into context; bash caps 100 lines/4 KB (oversize → pgate-spill; read spills offset/limit).

## Tests
- Test: narrowest target once (`npm test -- <file>`); read failure block, fix, verify once. No full-suite runs during iteration.
- Baseline: first verify run → `/tmp/<repo>-baseline.log`; diff later runs against it.

## Budget and replies
- Budget: multi-step tasks cost several× single-file edit; don't start under tight cap.
- Timebox verification: >3 tool calls on one acceptance criterion without conclusion → stop, report interim, ask to continue.
- Land: near cap → patch first, summary second. Exhausted budgets cut prose, not code.
- Reply: terse; never restate file contents/output/diffs in prose — cite path:line.

## Extensions and sessions
- Load extensions per project, never globally (re-bills prompt every turn); exception: permission-gate, enforcement layer itself.
- Release work: each concern (version bump, changelog, issue close) = own short session; never chain into one long session — every turn re-reads prefix. Session-length thresholds: [workflow.md](workflow.md).
