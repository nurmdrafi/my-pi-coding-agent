# Report format — Phase 4 detail

Required content + chart format behind SKILL.md Phase 4 gate.

Reader = developer deciding whether to spend an afternoon, on what. Finding they can't price, verify, or check off later = finding they won't act on.

## Header

`sessionsDir`, session count, date window — later comparison knows scope. Nothing else; tool-internal notes → workdir, not deliverable.

## Required content

1. Totals in dollars *and* tokens. Carry through both disclosures `views` prints — unpriced-model share, reasoning tokens + compaction re-sends unpriced by waste model — label totals heuristic floor.
2. Findings-by-rule table with sessions-affected column. 200 findings across 4 sessions = one bad week; across 60 = habit. Count alone can't distinguish; fix differs.
3. Per-project breakdown (`views` → Projects by waste). Dev acts one repo at a time. Note where dollar + token rankings disagree — means pricier model, changes priority.
4. Ranked fixes, each carrying all five:
   - Evidence — real file names, real behaviors, user's quoted words where fetched.
   - Full session ids (uuid), never truncated, + command to check one:
     `node <skill-dir>/scripts/audit.mjs fetch <session-id> --kind user_text --limit 3 --max-bytes 500`
   - Cost — dollars + tokens, share of headline.
   - Attribution — habit / skill_file / config.
   - Target metric — exact row + number that should move by next audit ("`CACHE_TTL_EXPIRY` 4,202K / $21 → under 1,500K"). Without one, fix unfalsifiable.
5. **"Do this first" pick, chosen on effort × permanence — not waste rank.** `skill_file`/`config` fix = one edit paying forever; `habit` fix = indefinite discipline, no enforcement. Top item habit + smaller one-line skill edit → say plainly skill edit goes first, why. Any `skill_file` fix: name file + text to change.
6. Trend. Before writing: `ls ~/.pi/agent/audit-reports/`. Prior reports exist → read most recent totals table, state direction. Empty archive → "first audit — no baseline yet".
7. Audit self-cost — fetch count + bytes from `fetch_log.jsonl`, labelled lower bound (I6).
8. ASCII charts — four visualizations inline with the table each summarizes (findings-by-rule table → rule chart immediately after; per-project breakdown → project chart; per-date trend → date chart; cache hit-ratio section → distribution histogram). Each chart authored two versions:
   - Wide (~100 cols) in report file: full labels + session counts.
   - Compact (~40 cols) in chat summary: shortened labels, no session counts.

```text
Wide (~100 cols):

CACHE_TTL_EXPIRY    ████████████████████████████████████████      47 sess /  $35.02
DUP_TOOL_CALL       ████████████                                  31 sess /  $14.20
BIG_TOOL_OUTPUT     ████                                           62 sess /  $7.58
RETRY_STORM         ██                                              9 sess /  $0.84

Compact (~40 cols, label ≤ 15 chars, bar 20 chars, numbers ~8 chars):

CACHE_TTL      ████████████████████  $35
DUP_TOOL       ████████              $14
BIG_TOOL       ██                     $8
RETRY          █                      $1
```

- Each chart in fenced code block — monospace alignment survives rendering.
- Bar char `█` (U+2588). Whole units only — no fractional blocks.
- Layout: right-padded label · bar · numbers. Fixed label width so bars line up.
- Scale: auto-scale to max value; largest bar fills bar column.
- Sort: value descending — worst item leads.
