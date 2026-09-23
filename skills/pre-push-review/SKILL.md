---
name: pre-push-review
description: "Local pre-push correctness review mirroring the barikoi/code-review CI bot (ollama-code-review.yml@v1). Catches the classes that bot files issues for: async/stale-state races, incomplete resets, payload/contract mismatches, fix-induced guard regressions, permission gating. Run before commit+push."
disable-model-invocation: true
---

Review the diff that is about to be committed/pushed — same scope and bar as the
CI push-review bot (`barikoi/code-review`). Goal: catch here what the bot would
file as an issue after the push.

## 0. Sync with the live bot (barikoi/code-review) — every invocation

Fetch the bot's current criteria; the fetched prompt is authoritative, the
checklist in §2 is the stable empirical addendum (where findings actually
clustered). New rules added to the repo take effect automatically here:

```sh
cat ~/Barikoi/code-review/prompt.md 2>/dev/null \
  || gh api repos/barikoi/code-review/contents/prompt.md \
       -H "Accept: application/vnd.github.raw"
```

- Local clone wins (fast, offline). `gh api` reads HEAD; consumer repos pin
  `@v1`, so HEAD is what the next tag cut will enforce — review against it.
- Both failed (offline, no clone): say so explicitly and proceed on §2 alone.

## 1. Establish the diff

```sh
git fetch --quiet
# pre-commit: everything not yet committed
git diff HEAD
# pre-push: what a push would send (bot reviews merge-base(default, HEAD)..HEAD)
git diff @{push}.. 2>/dev/null || git diff "$(git merge-base origin/$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | cut -d/ -f2 || echo main) HEAD)"..HEAD
```

Read whole functions/components around each hunk, not just the hunk — the bot
only sees the diff; locally we can do better.

## 2. Checklist (ordered by observed bot-hit frequency, 2026-09 7-day audit: 17 findings)

1. **Async/state lifecycle** (~60% of findings)
   - Late response: fetch-in-effect has a staleness guard (cancelled flag /
     AbortController / compare requested id before applying).
   - Failure path: every promise chain has `.catch`; on failure clear the
     *previous* entity's data so it cannot be saved against the new selection.
   - Selector change: lists cleared while refetching; guarded against
     out-of-order resolution (carry the requested id through to fulfillment).
   - Mount/enable timing: `setFieldsValue` or sync against a target that may
     not be mounted yet (rc-tabs lazy panes → `forceRender: true`); sync also
     on enable/disable transitions, not only on data or instance change.
2. **Reset completeness**: when clearing/changing state, enumerate every
   derived field; grep each consumer of the reset variables (bot caught
   `polygonData` surviving "Clear Polygon" and being submitted).
3. **Fix-induced guard regressions** (5 consecutive bot hits on one block):
   after adding a guard, check BOTH failure modes — skips-when-it-should-run
   and runs-when-it-should-skip. Listener/handler registration idempotent
   (remove before re-add, or one-shot flag that the right event resets).
   **Always re-review your own fix diff separately** (see step 4).
4. **Payload/contract correctness**: field-by-field vs the API docs and vs
   sibling configs (bot caught `adm2_en` set to a place code); `per_page`
   vs documented API cap — paginate or warn, never silently truncate.
5. **Pre-filled form vs `??` fallback**: `values.x ?? o.x` is dead code when
   the form pre-fills `x` — bulk operations then apply row 1's value to all
   rows. Open fields empty or track touched fields.
6. **UI polarity/defaults**: visibility conditions and default states
   (bot caught a panel at `span=0` unless the nav was collapsed).
7. **Security** (the bot files these; check every one):
   - Route-level: mutating endpoints/routes carry authN + permission gates
     (role/permission check, not just "logged in").
   - Object-level (IDOR): every id-addressed read/write verifies the caller
     owns / may access that specific record — a route gate does NOT cover this.
   - Input at trust boundaries: params/body/query validated or allowlisted
     before use; user-controlled strings reaching HTML/SQL/shell/eval = finding.
   - Output: responses and logs expose no fields the caller shouldn't see
     (PII, tokens, internal ids); no secrets compiled into client bundles.
   - CI/workflow edits: self-hosted runners on public repos, secret exposure,
     unpinned third-party actions/tags.
8. **CI/env awareness**: browser/tool launches must go headless when `CI`
   is set; env-aware defaults everywhere.

## 3. Severity (same as bot)

- high: breaks at runtime, loses data, exploitable
- medium: likely bug or security weakness under realistic conditions
- low: minor correctness/robustness concern

## 4. Output

Findings, one block each (mirrors the bot's issue format):

```
file:line [SEVERITY] title
detail: why it is a problem (concrete failure scenario)
suggestion: what to change
```

Then a verdict: every medium+ is fixed or explicitly waived with a stated
reason before `git commit` / `git push`.

## 5. Fix loop (mandatory)

After applying fixes, re-run this review on the fix diff alone. The 2026-09
evidence: dhaka-express-admin took 5 consecutive pushed fixes to one
edit-polygon block — each fix closed the reported finding and opened the
adjacent one. The fix diff is a new diff; review it like one.
