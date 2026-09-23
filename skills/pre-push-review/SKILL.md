---
name: pre-push-review
description: "Local correctness review of the diff about to be committed/pushed: async/stale-state races, incomplete resets, payload/contract mismatches, fix-induced guard regressions, permission gaps. Run before commit+push."
disable-model-invocation: true
---

Review the diff that is about to be committed or pushed. Goal: catch locally
what a reviewer or CI would flag after the push.

## 1. Establish the diff

```sh
# pre-commit: everything not yet committed
git diff HEAD
# pre-push: what a push would send
git diff @{push}.. 2>/dev/null || git diff "$(git merge-base origin/HEAD HEAD 2>/dev/null || echo origin/main)"..HEAD
```

Read whole functions/components around each hunk, not just the hunk.

## 2. Checklist

1. **Async/state lifecycle**
   - Late response: fetch-in-effect has a staleness guard (cancelled flag /
     AbortController / compare requested id before applying).
   - Failure path: every promise chain handles failure and clears the
     *previous* entity's data so it cannot be saved against the new selection.
   - Selector change: lists cleared while refetching; guarded against
     out-of-order resolution (carry the requested id through to fulfillment).
   - Mount/enable timing: no syncing against targets that may not be mounted
     yet (lazy-rendered panes); sync on enable/disable transitions too, not
     only on data or instance change.
2. **Reset completeness**: when clearing/changing state, enumerate every
   derived field and grep each consumer — cleared UI must not leave stale
   data that still gets submitted.
3. **Fix-induced guard regressions**: after adding a guard, check BOTH
   failure modes — skips-when-it-should-run and runs-when-it-should-skip.
   Handler/listener registration idempotent (remove before re-add, or a
   one-shot flag the right event resets).
4. **Payload/contract correctness**: field-by-field vs the API docs and vs
   sibling configs; request params vs documented caps — paginate or warn,
   never silently truncate.
5. **Pre-filled form vs `??` fallback**: `values.x ?? o.x` is dead code when
   the form pre-fills `x` — bulk operations then apply row 1's value to all
   rows. Leave fields empty or track touched fields.
6. **UI polarity/defaults**: visibility conditions and default states.
7. **Security** (check every one):
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

## 3. Severity

- high: breaks at runtime, loses data, exploitable
- medium: likely bug or security weakness under realistic conditions
- low: minor correctness/robustness concern

## 4. Output

One block per finding:

```
file:line [SEVERITY] title
detail: why it is a problem (concrete failure scenario)
suggestion: what to change
```

Then a verdict: every medium+ is fixed or explicitly waived with a stated
reason before `git commit` / `git push`.

## 5. Fix loop (mandatory)

After applying fixes, re-run this review on the fix diff alone. A fix can
close the reported finding and open the adjacent one; the fix diff is a new
diff — review it like one.
