---
name: session-audit
description: >
  Audit pi agent session logs (~/.pi/agent/sessions) for token/cost waste and
  produce a ranked, attributed efficiency report (habit / skill_file / config).
  Use when the user asks to audit session efficiency, analyze token waste or
  cost blowups, review usage cost, or asks "where are my tokens going".
disable-model-invocation: true
---

# Session-Audit (pi)

You are the reasoning layer (L2/L3) of a layered audit engine. Bundled deterministic scripts (L0/L1) digest raw session logs into metadata-only artifacts; you reason over aggregates and escalate to content only through a budget-capped fetch interface.

`<skill-dir>` below is this skill's directory (the `location` attribute on the injected skill tag; normally `~/.pi/agent/skills/session-audit`). Set the workdir once and use it everywhere:

```sh
export AUDIT_WORKDIR=<session scratchpad>/audit_workdir   # working artifacts — ephemeral
```

**Two lifetimes.** The JSON artifacts are intermediates and belong in the ephemeral workdir. The **report is the deliverable and must outlive the session** — it goes to a dated file in a stable archive:

```sh
mkdir -p ~/.pi/agent/audit-reports
# final report -> ~/.pi/agent/audit-reports/<YYYY-MM-DDTHHMMSSZ>.md
```

Keeping past reports is also the only way to answer "am I improving?": trend comes from comparing today's report to the archive, not from the data layer.

## Invariants (non-negotiable)

1. **(I1)** **Never read a raw session JSONL directly** (no read/cat/grep on `~/.pi/agent/sessions/**/*.jsonl`). All access goes through `run` and `fetch`.
2. **(I2)** Reason over metadata by default; fetch content only to resolve a specific hypothesis, `--max-bytes ≤ 2000`, at most ~10 fetches per audit.
3. **(I3)** Waste math never trusts raw `input` token sums (streaming placeholders). Anchor on `cacheRead`, `cacheWrite`, and content bytes.
4. **(I4)** All aggregation is deduped by `responseId` (the scripts do this — do not hand-roll parsing).
5. **(I5)** The active session is self-excluded by the runner; never audit the session you are running in.
6. **(I6)** Report the audit's own self-cost from `fetch_log.jsonl` at the end — and label it a **lower bound**: it counts escalation fetches only, not the Phase 1 landscape or your own reasoning turns.
7. **(I7)** **Write only to `$AUDIT_WORKDIR` and the report.** Never edit this skill's own files (`SKILL.md`, `bin/`, `src/`) or the user's repo. You are an installed bundle: a relative path like `src/views.mjs` points at *your own running code*. An audit that patches its own renderer measures itself with something that changed mid-run, and the next install destroys the change without a word.

## Phase 0 — Digest (L0 + L1, zero LLM)

```sh
node <skill-dir>/bin/audit.mjs run            # full directory
node <skill-dir>/bin/audit.mjs run --max 50   # quick pass, newest 50 sessions
```

Writes to `$AUDIT_WORKDIR`: `manifest.json` (thresholds + `pricing`: derived per-model input rates from logged `usage.cost`, unpriced models seen, and the share of waste that carries a price), `l1_findings.json` (rule findings: `{rule, severity, sessionId, turnPointers, evidenceStats, estWasteTokens, project}`), `overview.json` (aggregates: `projects`, `tools`, `models`, `gapBuckets`, `dates`, `skills`, `sessions` sorted by waste). Per-session and per-project rollups carry `wasteUsd` alongside `wasteTokens`, plus `models`, `usdPerMTok`, `pricedShare`, and `compactions`.

Rules emitted: `CACHE_TTL_EXPIRY`, `DUP_TOOL_CALL`, `BIG_TOOL_OUTPUT`, `RETRY_STORM`, `CACHE_MISS_RATE`, `CONTEXT_GROWTH`.

## Phase 1 — Read the aggregate landscape

```sh
node <skill-dir>/bin/audit.mjs views
```

One bounded block: totals (tokens **and** dollars), findings-by-rule with a sessions-affected count, cache hit-ratio distribution, projects and worst sessions by waste (full session ids, with the `fetch` command to inspect one), idle-gap cost curve, tools by bytes, peak-context and compactions, per-date trend, skill usage.

Do **not** read `overview.json` / `l1_findings.json` wholesale (>100KB), and do not hand-roll node one-liners for anything `views` already prints — every query and its output lands in your transcript, which is the audit's real self-cost.

**If a stat you need is missing, say so in the report — do not add it to `views.mjs`.** You are running from an installed bundle (I7). Record the gap under a "stats this report wanted and could not get" note; a human ports it to the repo. Where a missing stat blocks a specific claim, a single narrow query is acceptable — but state in the report that you ran it, because the transcript cost is real and unlogged.

Two traps the view exists to prevent:

- **Finding counts are not population counts.** Every rule has entry gates — `CACHE_MISS_RATE` needs ratio < 0.5 *and* ≥5 turns — so "1 finding" never means "1 session with that property". Read the distribution block, never the rule count.
- **Raw vs. cost-equivalent tokens.** `gapBuckets.cacheCreation` is raw; rule waste is cost-equivalent (`creation × (write − read)`). The view prints the gap curve in both units. Compare like with like before claiming two methods corroborate.

## Phase 2 — L2 hypothesis loop

1. From the landscape, form candidate patterns. Recurring high-value ones: TTL expiry after idle gaps (check `gapBuckets` — cost per resume vs the `lt_1m` baseline), large-file re-read loops (DUP + BIG on `read`/`bash` in the same sessions), marathon sessions near the context ceiling, compaction-heavy sessions, unbatched round-trips (many single-tool turns), image-heavy low-cache sessions.
2. Confirm or dismiss with narrower queries over per-session `findingsByRule` and per-session finding details.
3. Where metadata cannot resolve intent, escalate with fetch:

```sh
node <skill-dir>/bin/audit.mjs fetch <session-id> --kind <kind> [--limit N] [--max-bytes B] [--uuid U] [--radius K]
```

| kind | returns | use to judge |
|---|---|---|
| `user_text` | user messages (skill injections excluded) | intent vs agent behavior |
| `error_head` | head of errored tool results | transient vs deterministic failure |
| `tool_input` | tool call params | which file/command was duplicated |
| `assistant_head` | head of assistant text | verbosity / narration |
| `turn_window` | metadata around a `--uuid` responseId | sequence reconstruction |

4. Write `$AUDIT_WORKDIR/l2_hypotheses.json`:

```json
[{ "pattern": "NAME", "evidence": ["stat or fetch ref", "..."], "confidence": "high|medium|low",
   "escalation_fetches": ["..."], "resolution": "resolved|escalate", "interpretation": "one sentence" }]
```

## Phase 3 — L3 attribution

Reason over the hypotheses plus fetched snippets only. Write `$AUDIT_WORKDIR/attribution.json`, ranked by waste:

```json
[{ "rank": 1, "finding": "...", "attribution": "habit|skill_file|config",
   "estWasteShare": "~N% (xK of yK)", "trend": "improving|worsening|steady",
   "fix": "concrete behavior change, named skill edit, or config change" }]
```

Attribution guide: **habit** = working style (resuming big sessions after breaks, inline scanning, whole-file re-reads, unbatched commands); **skill_file** = a named skill drives the pattern (say which SKILL.md and what to change — its instructions made the agent read too much, or its description fires it on tasks it shouldn't serve); **config** = model default, thinking level, AGENTS.md/skill-catalog bloat (permanently re-sent prefix), provider cache behavior.

## Phase 4 — Report

Write **`~/.pi/agent/audit-reports/<YYYY-MM-DDTHHMMSSZ>.md`** (create the directory if absent). Generate the timestamp with `date -u +%Y-%m-%dT%H%M%SZ` (UTC, second-precision).

The report is read by a developer deciding **whether to spend an afternoon on this, and on what**. A finding they cannot price, verify, or check off later is a finding they will not act on.

**Header.** `sessionsDir`, session count, and date window, so a later comparison knows its scope. Nothing else — keep tool-internal notes out of the deliverable; put them in the workdir.

**Required content:**

1. **Totals in dollars *and* tokens.** Carry through both disclosures `views` prints — the unpriced-model share, and that reasoning tokens and compaction re-sends are unpriced by the waste model — and label the totals a heuristic floor.
2. **Findings-by-rule table** with the **sessions-affected** column. 200 findings across 4 sessions is one bad week; across 60 it is a habit. The finding count alone cannot distinguish them, and the fix differs.
3. **Per-project breakdown** (`views` → Projects by waste). A dev acts on one repo at a time. Note where the dollar and token rankings disagree — that means a pricier model, and it changes the priority.
4. **Ranked fixes**, each carrying all five of:
   - **Evidence** — real file names, real behaviors, the user's own quoted words where fetched.
   - **Full session ids** (the uuid), never truncated, plus the command to check one:
     `node <skill-dir>/bin/audit.mjs fetch <session-id> --kind user_text --limit 3 --max-bytes 500`
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

### Chart format

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

Then summarize the top 3 changes in chat, in the user's own context, and say where the report was saved.

## Interpretation notes

- `CONTEXT_GROWTH` carries zero direct waste — treat it as an amplifier of everything else in that session. Compaction counts work the same way: a compaction re-sends a summary in place of the prefix, and its cost is not separately priced.
- `CACHE_TTL_EXPIRY` findings carry `evidenceStats.gapKind`. Only `user_idle` gaps are priced as waste; `tool_runtime` gaps are reported at **zero waste by design** — the wait was a long-running command, not a habit. Check `gapKind` before calling any TTL finding a habit.
- Rank by **prefix persistence**: early, long-riding costs beat late one-offs of the same size.
- **Dollars are priced per session, from its own model mix** (rates derived from the sessions' own logged `usage.cost`) — so the token ranking and the dollar ranking can legitimately disagree. Where they do, the dollar order is the one to act on, and worth calling out.
- Peak context can exceed 200K on large-context models; don't call it a bug.
- A healthy directory (hit ratio >0.95, near-linear growth) deserves a short report saying so — do not manufacture findings.
