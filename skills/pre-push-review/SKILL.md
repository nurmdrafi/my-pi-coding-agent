---
name: pre-push-review
description: "Local correctness review of the diff about to be committed/pushed: async/stale-state races, incomplete resets, payload/contract mismatches, fix-induced guard regressions, permission gaps. Use for 'review my diff', 'pre-push check', before any non-trivial commit+push."
disable-model-invocation: true
---

This body is in context once the skill loads — never re-read this file from disk in the same session.

Review the diff that is about to be committed or pushed. Goal: catch locally
what a reviewer or CI would flag after the push.

## 1. Establish the diff

```sh
# pre-commit: everything not yet committed
git diff HEAD
# pre-push: what a push would send
git diff @{push}.. 2>/dev/null || git diff "$(git merge-base origin/HEAD HEAD 2>/dev/null || echo origin/main)"..HEAD
# already pushed: revalidate a commit range (e.g. everything pushed today)
git log --oneline @{push}..HEAD   # empty = nothing unpushed, then diff the range
git diff <base>..HEAD
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
   derived field and rg each consumer — cleared UI must not leave stale
   data that still gets submitted.
3. **Fix-induced guard regressions**: after adding a guard, check BOTH
   failure modes — skips-when-it-should-run and runs-when-it-should-skip.
   Handler/listener registration idempotent (remove before re-add, or a
   one-shot flag the right event resets).
4. **Payload/contract correctness**: field-by-field vs the API docs and vs
   sibling configs; request params vs documented caps — paginate or warn,
   never silently truncate.
   - Truthiness guards on payload fields drop `false`/`0`/`''` values:
     `if (k === 'x' && !values[k]) return` makes `x: false` unsendable. For
     optional booleans use tri-state (undefined = untouched) and
     `!== undefined` checks, never `!`.
   - Data-shape reads verified against a sibling consumer of the same
     endpoint/hook: RTK Query `.unwrap()` returns the response *body*, so
     `res?.data?.x` after unwrap is silently `undefined` — the sibling's
     read of the same field settles it in one glance.
5. **Null-unsafe member access**: API-derived values reach
   `.charAt`/`.toString`/`.map`/… without optional chaining or a null check
   — rg the touched file for member access on response fields.
6. **Failure paths keep context**: failure paths clear loading/spinner state
   and preserve user context (modal stays open with the server error shown),
   instead of closing on error.
7. **Pre-filled form vs `??` fallback**: `values.x ?? o.x` is dead code when
   the form pre-fills `x` — bulk operations then apply row 1's value to all
   rows. Leave fields empty or track touched fields.
8. **Framework-behavior assumptions**: when a fix's correctness hinges on
   library internals (event order, prop injection, form-store semantics),
   verify against the installed package source
   (`node_modules/<pkg>/es|lib/*.js`) instead of reasoning from memory.
   Real cases where guessing wrong silently inverts a fix: rc-select fires
   `onChange` before `onSelect` on option pick; rc-field-form's `Form.Item`
   injects value/onChange via cloneElement — injected props override the
   child's explicit ones, and an explicit child handler runs chained *after*
   the store update; form `initialValues` apply only at mount, so
   async-loaded data needs a remount gate (loading spinner) or
   `setFieldsValue`.
9. **UI polarity/defaults**: visibility conditions and default states.
10. **Security** (check every one):
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
11. **CI/env awareness**: browser/tool launches must go headless when `CI`
   is set; env-aware defaults everywhere.
12. **Regression-test discrimination**: a test added for a fixed bug must be
   shown to fail on the bug — restore the buggy line once, watch it go red,
   re-apply the fix. A regression test that has never failed proves nothing
   about detection.

## 3. Severity

- high: breaks at runtime, loses data, exploitable
- medium: likely bug or security weakness under realistic conditions
- low: minor correctness/robustness concern

## 4. Output

Prove a finding before you publish it — the verification ladder,
false-positive cases, and `[UNVERIFIED]` labeling rules are in
`references/finding-verification.md`.

One block per finding:

```
file:line [SEVERITY] title
observed: the concrete input/state and the wrong result it produces (not a suspicion)
suggestion: what to change
```

Then a verdict: every medium+ is fixed or explicitly waived with a stated
reason before `git commit` / `git push`. Keep retracted false positives in the
verdict as "cleared, do NOT chase" so nobody re-raises them — the same reasoning
that discounts it once discounts it the second time. Commit message must
pass commitlint convention (`type(scope): subject`, lowercase, imperative)
*before* committing — fix it before `git commit`, not after commitlint
rejects it.

## 5. Fix loop (mandatory)

After applying fixes, re-run this review on the fix diff alone. A fix can
close the reported finding and open the adjacent one; the fix diff is a new
diff — review it like one. The re-review may also invalidate the original
suggestion: hold every suggestion to the same evidence standard (installed
source, actual id/link sources, payload consumers) before applying it, and
waiving a finding with corrected reasoning is a valid outcome.

## 6. Per-issue ship loop

When the work is tied to a gh issue, the loop is: fix → review (this skill)
→ conventional-commit message ending `(issue #N)` → push → `gh issue close N
--comment` with a summary of the shipped changes.
