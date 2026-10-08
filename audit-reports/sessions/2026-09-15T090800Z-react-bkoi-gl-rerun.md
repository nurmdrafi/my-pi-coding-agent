# Session Audit re-run — react-bkoi-gl `01a0a345-1032-7278-a923-bf3126db2be2` (rule-priced)

**Scope:** sessionsDir `~/.pi/agent/sessions`; 70 sessions digested (2026-08-30 → 2026-09-15); this report covers the 2026-09-15 04:13–12:46 react-bkoi-gl session (glm-5.3, user-reported ↑482K ↓148K R35M CH99.8% $10.489). Previous audit (2026-09-15T063200Z.md) was fetch-only because the session was live; figures below are now rule-priced with the session closed.

## Session totals (heuristic floor)

- 270 api turns · peak context 306K (1.53× the 200K default ceiling — large-context model, not a bug) · 0 compactions.
- Rule waste **296K tokens ≈ $0.41** — the largest single-session waste in the whole directory (next: 122K). Directory-wide: 1,739K / $1.55.
- Rule waste is a floor: the dominant cost (35M cache-read prefix over 270 turns) is invisible to the waste model by design; total session bill was $10.49.

## Findings (rule-priced)

| rule | n | tokens | detail |
|---|---|---|---|
| BIG_TOOL_OUTPUT | 2 | 296K ($0.41) | two 51,339-B bash outputs — same command rerun, ~21K excess bytes each; one landed as a **59K-token input spike** in a single turn (turn i=5, 04:16Z) |
| CONTEXT_GROWTH | 1 | 0 (amplifier) | peak 306K — every other waste in the session was re-paid ~300× through the prefix |

Unpriced: reasoning/output tokens, compaction re-sends (none here). CacheWrite legs not logged by provider — TTL/miss rules structurally blind (carried from 09-14 report).

## Attribution & fixes (updated)

1. **Uncapped build/test output (296K, $0.41 — the top rule-priced item).** A verbose `npm run ...` was run twice with full stdout into context (~51KB each; 59K-token turn). This directly violates the AGENTS.md cap rule (`npm/build/test: | rg 'error TS|FAIL|Error' | sort -u | head -40`). **Attribution: habit** (rule exists, wasn't followed). Target: per-session BIG_TOOL_OUTPUT on bash 2 → 0; no turn with `input` >20K.
2. **Marathon session (~85% of the $10.49, unpriced).** Unchanged from previous report: 25+ feedback rounds, 270 turns, peak 306K, no compaction. Target: no session ending >150K peak.
3. **E2E churn + dup probes (~10%).** Unchanged. Target: pkill/nohup 13 → ≤2 per session.
4. **Ponytail ladder** — user re-enabled it in `~/.pi/agent/AGENTS.md` this session after A/B testing: without it, overthinking/over-engineering and token usage rose. Ladder now permanently in the prefix (~350 tokens/rung-set) and should suppress speculative code paths like the badge/CI/release churn seen 04:13–04:43.

**Do this first:** fix 1 — it's a pipe, zero effort, one edit to how commands are typed (the AGENTS.md rule already says it; this is enforcement, not authoring).

## Trend

Prior reports: 2026-09-14 (1,375K / $1.59, 0.66% of read) → today 1,739K / $1.55, 0.46% of read. Rule-priced rate improving; marathon sessions worsening (this session is the new worst by both turns-at-peak and raw dollars). react-bkoi-gl project total: 10 sessions, 119.2M read, 494K waste, $0.60.

## Stats wanted and not available

- Which exact command produced the 51KB outputs (turn_window exposes usage, not command text; fetch budget reached). `call_04766d1bccff46658faf1bc5` and `call_2f704a134b92468daa4b6160` are the pointers for manual lookup.
- Reasoning-token pricing for glm-5.3 output (148K ↓).

## Audit self-cost (lower bound)

This re-run: 3 fetches (turn_window ×3, ~3KB) + 2 digest/views runs. Previous audit: 6 fetches (~9KB) + 2 runs. Excludes reasoning turns.
