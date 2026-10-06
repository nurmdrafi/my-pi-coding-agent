# Telemetry & Audit Redesign — Design

Date: 2026-10-06
Status: approved (grilling rounds 1–3), pending implementation
Scope: `~/.pi/agent` harness — extensions, audit-reports, harness-engineer skill

## Motivation

User-reported pains: redundant telemetry (pi natively logs raw events), perceived
token cost, maintenance burden of two always-on extensions, scattered audit
artifacts, and audits re-processing already-audited data.

## Validated facts (decision basis)

1. **Extensions add ~0 context tokens.** Extension code runs in the pi process,
   never in the model prefix. Verified empirically: real session system messages
   contain no extension or slash-command text. The only in-context cost in the
   system is permission-gate's block text when it fires — its function.
2. **pi natively records all raw events.** `sessions/<cwd-slug>/*.jsonl` holds
   tool errors and guard blocks (verified: `isError` and Permission-block
   entries present). Not native: per-day error index, provider-HTTP-error and
   compaction-failure capture (`PI_TELEMETRY` is install phone-home).
3. **The audit toolkit already derives every signal from sessions.**
   `error_audit.py` (session mode), `audit_toolcall_rules.py`, `usage-metrics.py`
   (per-turn tokens, cache %, cost-tail), `skill_usage_audit.py`.
4. **No external solution fits**: observability platforms (Langfuse, LangSmith,
   Helicone, Galileo, OpenObserve) target app-level tracing via servers/SaaS —
   wrong shape for a single-user local harness. Local hooks→files (the current
   pattern) is the community best practice (Claude Code ecosystem).

## Decisions

### D1 — Drop both telemetry extensions

- Delete `extensions/error-telemetry.ts` and `extensions/session-learnings.ts`.
- Extensions reduce to `permission-gate` only.
- Accepted losses: `/errors` command, provider-HTTP/compaction-failure capture,
  per-day cross-project index, the pre-ranked learnings queue. Sessions remain
  the single source of truth; the audit toolkit covers all derivable signals.

### D2 — Delete the data stores

- Delete `logs/` (errors-*.jsonl; gitignored, zero consumers after D1).
- Delete `learnings/` (pending.md; gitignored; its drain step is replaced by
  session-driven audit below).

### D3 — Audit storage layout

- `audit-reports/{harness,skills,sessions}/` subdirs, one file per audit run:
  `<date>T<time>Z-<topic>.md`.
- Retrofit: move the 8 existing flat `audit-reports/*.md` into the matching
  subdir (classified by content); move root `harness-audit-report.md` in as well.

### D4 — No-re-audit watermark

- `audit-reports/.watermark.json`: `{ "auditedThrough": "<ISO ts>",
  "counts": { "sessions": N } }`, initialized from the 2026-10-05 report's
  coverage so already-audited sessions are never re-processed.
- Session identity = ISO-prefixed session filename timestamps (mtime not trusted).
- Protocol lives in harness-engineer SKILL.md as Audit-mode step 0.5:
  - scope strictly to sources newer than `auditedThrough`;
  - if any previously-counted session file is missing or the count shrank
    (history deleted/edited) → **stop and ask**; never silently re-audit.

### D5 — Audit flow (rewrites harness-engineer Audit mode)

watermark check → run existing scripts over new sessions only → promote
recurring findings into AGENTS.md rules / skills / permission-gate guards
(each promotion gets a `Measured:` CHANGELOG line) → write report into the
matching subdir → advance watermark → prune sessions.

### D6 — Session retention: 30 days

- Audit-time step (replaces the earlier idea of extension-carried pruning):
  delete `sessions/**/*.jsonl` not modified in 30 days; remove emptied cwd-slug
  dirs. Worst-case growth between audits = 30d + audit cadence. Accepted.

## Rejected alternatives

- **Keep both extensions** — indexes derivable from native data; maintenance
  without unique value.
- **Time-based retention for logs/ and learnings/** — superseded by deleting
  both (original user instinct, validated by the watermark).
- **Resolution-based clearing** ("clear entries once a guard exists") — deletes
  exactly the false-positive evidence; "resolved" is undecidable automatically.
- **External observability platform** — servers/accounts/cloud for concerns this
  harness doesn't have.
- **New standalone audit skill** — harness-engineer already owns the process.

## Implementation outline

1. Delete `extensions/error-telemetry.ts`, `extensions/session-learnings.ts`,
   `logs/`, `learnings/`.
2. Scrub references: `README.md`, `extensions/README.md`,
   `skills/harness-engineer/SKILL.md` (step 0 queue drain → watermark + scripts
   flow; add prune step), `skills/harness-engineer/scripts/error_audit.py`
   (remove `--live` logs mode). CHANGELOG history stays untouched.
3. Create `audit-reports/{harness,skills,sessions}/`; retrofit the 8 flat
   reports + root `harness-audit-report.md`; write `.watermark.json` initialized
   from the 2026-10-05 report coverage.
4. Run `node tests/permission-gate.test.mjs` (unaffected, must stay 13/13).

## Out of scope

- permission-gate behavior (unchanged); its header date typo 2026-10-08→2026-10-05
  is fixed in step 2's commit — one word, no functional change.
- Provider-error capture replacement — accepted loss; revisit only if provider
  instability becomes a real debugging need.
