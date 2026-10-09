# Report format — Phase 4 detail

Required content and chart format behind the SKILL.md Phase 4 gate. Moved
verbatim from the body.

The report is read by a developer deciding **whether to spend an afternoon on this, and on what**. A finding they cannot price, verify, or check off later is a finding they will not act on.

**Header.** `sessionsDir`, session count, and date window, so a later comparison knows its scope. Nothing else — keep tool-internal notes out of the deliverable; put them in the workdir.

**Required content:**

1. **Totals in dollars *and* tokens.** Carry through both disclosures `views` prints — the unpriced-model share, and that reasoning tokens and compaction re-sends are unpriced by the waste model — and label the totals a heuristic floor.
2. **Findings-by-rule table** with the **sessions-affected** column. 200 findings across 4 sessions is one bad week; across 60 it is a habit. The finding count alone cannot distinguish them, and the fix differs.
3. **Per-project breakdown** (`views` → Projects by waste). A dev acts on one repo at a time. Note where the dollar and token rankings disagree — that means a pricier model, and it changes the priority.
4. **Ranked fixes**, each carrying all five of:
   - **Evidence** — real file names, real behaviors, the user's own quoted words where fetched.
   - **Full session ids** (the uuid), never truncated, plus the command to check one:
     `node <skill-dir>/scripts/audit.mjs fetch <session-id> --kind user_text --limit 3 --max-bytes 500`
   - **Cost** — dollars and tokens, with the share of headline.
   - **Attribution** — habit / skill_file / config.
   - **A target metric** — the exact row and number that should move by the next audit ("`CACHE_TTL_EXPIRY` 4,202K / $21 → under 1,500K"). Without one, the fix is unfalsifiable.
5. **A "do this first" pick, chosen on effort × permanence — not on waste rank.** A `skill_file` or `config` fix is one edit that keeps paying; a `habit` fix is indefinite discipline with no enforcement. When the top-ranked item is a habit and a smaller one is a one-line skill edit, say plainly that the skill edit goes first and why. For any `skill_file` fix, name the file and the text to change.
6. **Trend.** Before writing, `ls ~/.pi/agent/audit-reports/`. If prior reports exist, read the most recent totals table and state the direction. If the archive is empty say "first audit — no baseline yet".
7. **Audit self-cost** — fetch count + bytes from `fetch_log.jsonl`, labelled a lower bound (I6).
8. **ASCII charts** — four visualizations placed **inline with the table each summarizes** (findings-by-rule table → rule chart immediately after, per-project breakdown → project chart, per-date trend → date chart, cache hit-ratio section → distribution histogram). Each chart is authored in **two versions**:
   - **Wide** (~100 cols) in the report file: full labels and session counts.
   - **Compact** (~40 cols) in the chat summary: shortened labels, no session counts.
   Chart data is plotted **only from values already pulled from `views` output** (I7) — never re-derived or hand-rolled. If a stat is missing, skip that chart and note it under "stats this report wanted and could not get".

   The chat summary carries **all four compact charts**, placed right after the headline paragraph and before the trend story.

## Chart format

```text
Wide version (~100 cols, label ≤ 25 chars, bar 50 chars, numbers ~20 chars):

CACHE_TTL_EXPIRY   ████████████████████████████████████████████  119 sess / $35.26
DUP_TOOL_CALL      ██████████████████                            98 sess /  $14.01
BIG_TOOL_OUTPUT    ████                                           62 sess /  $7.58
RETRY_STORM        ██                                              9 sess /  $0.84

Compact version (~40 cols, label ≤ 15 chars, bar 20 chars, numbers ~8 chars):

CACHE_TTL      ████████████████████  $35
DUP_TOOL       ████████              $14
BIG_TOOL       ██                     $8
RETRY          █                      $1
```

- Wrap each chart in a fenced code block so monospace alignment survives rendering.
- **Bar character**: `█` (U+2588). Round bars to whole units — no fractional blocks.
- **Layout**: right-padded label · bar · numbers. Fixed label width so bars line up.
- **Scale**: auto-scale to the maximum value so the largest bar fills the bar column.
- **Sort**: rows ordered by value descending — the worst item leads.
