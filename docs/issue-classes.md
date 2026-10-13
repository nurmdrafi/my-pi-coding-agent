# Issue Classes — Prevention Catalog

Failure classes from repo review audit. Check diff against every touched class **before shipping** — goal: never filed again.

## Secrets & credentials
- No secret in client bundle, git history, image layers, logs — keys/webhooks/broker creds/tokens server-side/env only; check built bundle after build.
- No unmaintained dep with known CVEs in prod tree; audit prod deps, not just dev.
- Container/image registry private unless deliberate; no secret in image config.

## Authorization & auth
- AuthN+authZ server-side, never client-only: don't trust forgeable cookie/local flag; never ship "all permissions" to every user.
- Every mutating route: authN + explicit permission. Every id-addressed read/write: caller owns/can access record (IDOR).
- Login needs real credentials — no session for bare id.
- Logout revokes backend session, not just local state.
- Tokens: least privilege, never in client JS, never on cross-origin/scheme-less URLs, refresh before expiry.
- Cookies: `Secure`+`HttpOnly`+`SameSite`; no public-key "encryption" in localStorage.
- TLS verification never disabled, incl. proxy agents.
- Service worker: never cache authenticated responses across logout; no `skipWaiting`+runtime chunk rewrite stranding stale config.
- CSP+security headers set; no ids/secrets in access logs; rate-limit; container ports never bypass proxy.

## HTTP client & data contract
- Non-2xx = error, not data: reject, set timeouts, surface failure; never silent empty state.
- Stale-response guards: carry requested id/key to fulfillment; ignore out-of-order.
- No success toast/modal close on failed mutation; reset prior entity state on selection change.
- Validate/parse API values pre-use — nullable/string numbers hitting `.toFixed`/`.map`/`.charAt` blank UI.
- Method/origin match API: no POST to GET-only route, no scheme-less origin.
- Export/jobs: sanitize sheet/column names; fail loudly on shape mismatch; cover edge cases.

## Runtime robustness
- Error boundaries wrap page + major subtrees — one thrown panel must not blank app.
- Every async surface: loading/empty/error states; failed poll keeps last good view.
- Time/environment-dependent features work outside happy window (off-hours, offline, reconnects).

## Error handling (global)
- One owner per failure: single global layer catches/normalizes/logs/decides — components don't each re-handle (no duplicate toasts/logs/sign-outs).
- Handlers at every level: process (`window.onerror`, `unhandledrejection`; Node `uncaughtException`/`unhandledRejection`), router/app error page, component boundaries, data layer (one API interceptor).
- Classify every status/kind, never one generic message: network/timeout, 400/422 validation, 401 auth, 403 permission, 404 missing, 409 conflict, 429 throttle, 5xx server — each → user message + recovery action (retry/re-auth/back/report).
- Never swallow: no empty `catch`, no `console.error` stripped in prod; log with context (request id, route) server-side, report to tracker.
- Retry only transient failures, with backoff — never infinite, never deterministic.
- Fallback UI: error page/boundary with reset/retry; keep last good view; global handler guarded against own crash.
- Hygiene: user-facing text leaks no stacks/secrets/internal ids; global handling doesn't mask dev failures.

## Realtime & maps
- Rebuild layers/scenes on upstream data change — not hover/zoom/tick; one client per connection; reconnect only on real change; no duplicate clients; reset stale state on re-join.
- Heavy math off main thread; no O(N²) scans or pagination; scope selectors/hooks.

## CI / container / deploy
- Quality gate before prod image (lint+typecheck+tests), never skipped via Dockerfile/`.dockerignore`.
- Workflows: `concurrency` set, actions SHA-pinned, secrets step-scoped, least-privilege permissions.
- Container: fail fast on missing/placeholder env, correct escaping, no swallowed errors; healthcheck; memory/heap limits; non-root PID 1; no EOL base; verified toolchain tarball.
- Logs structured, retained; error reporting wired, not stripped in prod.
- Dirty `.dockerignore`, dep mismatches, commented-out gates = findings, not noise.
