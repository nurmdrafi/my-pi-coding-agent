---
name: pre-push-review
description: "Local correctness review of the diff about to be committed/pushed: async/stale-state races, incomplete resets, payload/contract mismatches, fix-induced guard regressions, permission gaps. Use for 'review my diff', 'pre-push check', before any non-trivial commit+push."
disable-model-invocation: true
---

Body in context once skill loads — never re-read from disk same session.

Review diff about to be committed/pushed. Goal: catch locally what reviewer/CI flags after push.

## 1. Establish diff

```sh
# pre-commit: everything uncommitted
git diff HEAD
# pre-push: what push would send
git diff @{push}.. 2>/dev/null || git diff "$(git merge-base origin/HEAD HEAD 2>/dev/null || echo origin/main)"..HEAD
# already pushed: revalidate commit range
git log --oneline @{push}..HEAD   # empty = nothing unpushed; then diff range
git diff <base>..HEAD
```

Read whole functions/components around each hunk, not just hunk.

## 2. Checklist

Domain catalog: auth/IDOR + HTTP-contract + runtime/error + container/deploy classes are owned by their skills (auth, frontend-design, github-actions) — check every class the diff touches.

- Async/state lifecycle
  - Late response: fetch-in-effect has staleness guard (cancelled flag / AbortController / compare requested id before applying).
  - Failure path: every promise chain handles failure, clears *previous* entity's data (never saved against new selection).
  - Selector change: lists cleared while refetching; out-of-order guarded (requested id carried to fulfillment).
  - Mount/enable timing: no syncing against unmounted targets (lazy panes); sync on enable/disable transitions too, not only data/instance change.
- Reset completeness: clearing/changing state → enumerate every derived field, `rg` each consumer — cleared UI leaves no stale data that still submits.
- Fix-induced guard regressions: new guard → check BOTH failure modes: skips-when-should-run + runs-when-it-should-skip. Handler/listener registration idempotent (remove before re-add, or one-shot flag the right event resets).
- Payload/contract correctness: field-by-field vs API docs + sibling configs; request params vs documented caps — paginate or warn, never silently truncate.
  - Truthiness guards drop `false`/`0`/`''`: `if (k === 'x' && !values[k]) return` makes `x: false` unsendable. Optional booleans: tri-state (undefined = untouched) + `!== undefined`, never `!`.
  - Data-shape reads verified vs sibling consumer of same endpoint/hook: RTK Query `.unwrap()` returns response *body*, so `res?.data?.x` after unwrap = silently `undefined` — sibling's read settles it in one glance.
- Null-unsafe member access: API-derived values hitting `.charAt`/`.toString`/`.map`/… without optional chaining/null check — `rg` touched file for member access on response fields.
- Failure paths keep context: clear loading/spinner, preserve user context (modal stays open with server error), no close-on-error.
- Pre-filled form vs `??` fallback: `values.x ?? o.x` dead code when form pre-fills `x` — bulk ops apply row 1's value to all rows. Empty fields or track touched.
- Framework-behavior assumptions: fix hinges on library internals (event order, prop injection, form-store semantics) → verify vs installed package source (`node_modules/<pkg>/es|lib/*.js`), never memory. Real wrong-guess cases silently inverting fixes:
  - rc-select fires `onChange` before `onSelect` on option pick
  - rc-field-form `Form.Item` injects value/onChange via cloneElement — injected props override child's explicit ones; explicit child handler runs chained *after* store update
  - form `initialValues` apply at mount only → async data needs remount gate (spinner) or `setFieldsValue`
- UI polarity/defaults: visibility conditions + default states.
- Security (every one):
  - Route-level: mutating endpoints/routes carry authN + permission gates (role/permission, not just "logged in").
  - Object-level (IDOR): every id-addressed read/write verifies caller owns/may access record — route gate does NOT cover this.
  - Input at trust boundaries: params/body/query validated/allowlisted before use; user-controlled strings reaching HTML/SQL/shell/eval = finding.
  - Output: responses/logs expose nothing caller shouldn't see (PII, tokens, internal ids); no secrets in client bundles.
  - CI/workflow edits: self-hosted runners on public repos, secret exposure, unpinned third-party actions/tags.
- CI/env awareness: browser/tool launches headless when `CI` set; env-aware defaults everywhere.
- Runtime robustness: new routes/subtrees under error boundary; async surfaces have loading/empty/error states; failed poll keeps last good view.
- Error handling (global): one owner catches/normalizes/logs/renders fallback; handlers at process, router, subtree, data-layer levels; every status/kind classified with recovery action; no swallowed error, no cannot-succeed retry.
- HTTP client: non-2xx rejects (never data), request timeouts, out-of-order guarded (requested id to fulfillment).
- Cache/SW: no authenticated response cached across logout; no `skipWaiting` + runtime chunk rewrite stranding stale config.
- TLS: cert verification never disabled (incl. proxy agents).
- Dependencies: no new unmaintained/CVE dep in prod tree.
- Method/origin match the API: no POST to a GET-only route, no scheme-less origin.
- Export/jobs: sanitize sheet/column names; fail loudly on shape mismatch; cover edge cases.
- Error-handling hygiene: user-facing text leaks no stacks/secrets/internal ids; global handling doesn't mask dev failures.
- Regression-test discrimination: bug-fix test must be shown failing on bug — restore buggy line once, watch red, re-apply fix. Regression test never failed = proves nothing about detection.

## 3. Severity

- high: runtime break, data loss, exploitable
- medium: likely bug/security weakness under realistic conditions
- low: minor correctness/robustness concern

## 4. Output

Prove finding before publishing — verification ladder, false-positive cases, `[UNVERIFIED]` labeling: `references/finding-verification.md`.

One block per finding:

```
file:line [SEVERITY] title
observed: concrete input/state + wrong result produced (not suspicion)
suggestion: what to change
```

Then verdict: every medium+ fixed or explicitly waived with stated reason before `git commit`/`git push`. Retracted false positives stay in verdict as "cleared, do NOT chase" — same reasoning discounts it twice. Commit message passes commitlint (`type(scope): subject`, lowercase, imperative) *before* committing — fix before `git commit`, not after reject.

## 5. Fix loop (mandatory)

After fixes, re-run review on fix diff alone. Fix can close reported finding + open adjacent one; fix diff = new diff, review like one. Re-review may invalidate original suggestion: hold every suggestion to same evidence standard (installed source, actual id/link sources, payload consumers) before applying; waiving finding with corrected reasoning = valid outcome.

## 6. Per-issue ship loop

Work tied to gh issue: fix → review (this skill) → conventional commit ending `(issue #N)` → push → `gh issue close N --comment` with shipped-changes summary. One comment per commit: short SHA included; edit existing comment, never second for same commit. Before close: diff vs issue acceptance criteria + suggested fix — unmet criterion blocks close; close valid only after push.
