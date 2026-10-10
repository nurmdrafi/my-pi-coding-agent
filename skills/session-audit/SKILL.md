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
7. **(I7)** **Write only to `$AUDIT_WORKDIR` and the report.** Never edit this skill's own files (`SKILL.md`, `scripts/`) or the user's repo. You are an installed bundle: a relative path like `scripts/views.mjs` points at *your own running code*. An audit that patches its own renderer measures itself with something that changed mid-run, and the next install destroys the change without a word.

## Scope gate — before any Phase 0 run

Relative target words ("current repo", "previous session", "last repo", "recent") are ambiguous: each retarget orphans every call already spent on the prior reading (measured: ~25% of audit `2026-10-10T121209Z`). When the request is relative, ask once and wait:

1. **Target** — which repo/project, or a session id?
2. **Window** — last 1 / last N / date range / whole project?
3. **Depth** — numbers only (L0/L1, no verdicts) or full audit (L2/L3 + report)?
4. **Output** — archived report or chat summary?

One cheap ask beats a rerun. A bare "yes" is not a scope — re-ask. Once confirmed, run cheap: `run --max 50` when the target is recent (single session / last day), and `views --project <name>` directly instead of the global view (capped global output forces spill-file re-reads).

## Phase 0 — Digest (L0 + L1, zero LLM)

```sh
node <skill-dir>/scripts/audit.mjs run            # full directory
node <skill-dir>/scripts/audit.mjs run --max 50   # quick pass, newest 50 sessions
```

Writes to `$AUDIT_WORKDIR`: `manifest.json` (thresholds + `pricing`: derived per-model input rates from logged `usage.cost`, unpriced models seen, and the share of waste that carries a price), `l1_findings.json` (rule findings: `{rule, severity, sessionId, turnPointers, evidenceStats, estWasteTokens, project}`), `overview.json` (aggregates: `projects`, `tools`, `models`, `gapBuckets`, `dates`, `skills`, `sessions` sorted by waste). Per-session and per-project rollups carry `wasteUsd` alongside `wasteTokens`, plus `models`, `usdPerMTok`, `pricedShare`, and `compactions`.

Rules emitted: `CACHE_TTL_EXPIRY`, `DUP_TOOL_CALL`, `BIG_TOOL_OUTPUT`, `RETRY_STORM`, `CACHE_MISS_RATE`, `CONTEXT_GROWTH`.

## Phase 1 — Read the aggregate landscape

**If the user names a target (project, path, or session) that is absent from the digest — stop and ask.** Never substitute a closest-match project and proceed; a wrong-target audit wastes an entire run and reports confidently about the wrong code. This includes targets excluded as active: report the exclusion and ask whether to inspect via `fetch`, audit after close, or pick a different target — the user decides, not the auditor.

```sh
node <skill-dir>/scripts/audit.mjs views
node <skill-dir>/scripts/audit.mjs views --project <name>   # per-project slice: sessions, finding detail, per-date trend
```

If the confirmed scope is a single project or session, slice with `views --project <name>` first; run the global view only for directory-wide questions.

One bounded block: totals (tokens **and** dollars), findings-by-rule with a sessions-affected count, cache hit-ratio distribution, projects and worst sessions by waste (full session ids, with the `fetch` command to inspect one), idle-gap cost curve, tools by bytes, dup-read targets, BIG_TOOL_OUTPUT by tool, peak-context and compactions, per-date trend, skill usage.

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
node <skill-dir>/scripts/audit.mjs fetch <session-id> --kind <kind> [--limit N] [--max-bytes B] [--uuid U] [--radius K]
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

Required content (header, totals, findings-by-rule with sessions-affected,
per-project breakdown, ranked fixes, do-this-first pick, trend, self-cost)
and the two-version ASCII chart format are in `references/report-format.md`.

Then summarize the top 3 changes in chat, in the user's own context, and say where the report was saved.

## Interpretation notes

- `CONTEXT_GROWTH` carries zero direct waste — treat it as an amplifier of everything else in that session. Compaction counts work the same way: a compaction re-sends a summary in place of the prefix, and its cost is not separately priced.
- `CACHE_TTL_EXPIRY` findings carry `evidenceStats.gapKind`. Only `user_idle` gaps are priced as waste; `tool_runtime` gaps are reported at **zero waste by design** — the wait was a long-running command, not a habit. Check `gapKind` before calling any TTL finding a habit.
- Rank by **prefix persistence**: early, long-riding costs beat late one-offs of the same size.
- **Dollars are priced per session, from its own model mix** (rates derived from the sessions' own logged `usage.cost`) — so the token ranking and the dollar ranking can legitimately disagree. Where they do, the dollar order is the one to act on, and worth calling out.
- `DUP_TOOL_CALL` on `read` was path-keyed in pre-2026-10-10 digests (the normalizer dropped `offset`/`limit`) — before attributing a read dup as waste, fetch `tool_input` and compare windows: disjoint windows are continuation reads, not dups. Keying fixed for `read` on 2026-10-10 (same class as the 2026-09-14 `edit` fix); old reports and archived digests still carry the false positives.
- Peak context can exceed 200K on large-context models; don't call it a bug.
- A healthy directory (hit ratio >0.95, near-linear growth) deserves a short report saying so — do not manufacture findings.
