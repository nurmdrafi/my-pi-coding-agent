# Issue Classes — Prevention Catalog

Project-agnostic failure classes compiled from a repo-wide review audit. Check the diff against every class that touches it **before shipping** — the goal is that these never get filed again.

## Secrets & credentials

- No secret in the client bundle, git history, image layers, or logs — keys, webhooks, broker creds, tokens are server-side/env only; check the built bundle after a build.
- No unmaintained dependency with known CVEs in the production tree; audit prod deps, not just dev.
- Container/image registry is private unless deliberately public; no secret in image config.

## Authorization & auth

- AuthN + authZ enforced server-side. Never client-side-only: never trust a cookie/local flag the user can forge, never ship "all permissions" to every user.
- Every mutating route: authN + explicit permission check. Every id-addressed read/write: caller owns/may access that record (IDOR).
- Login requires real credentials — no session for a bare id.
- Logout revokes the backend session, not just local state.
- Tokens: least privilege, never exposed to client JS, never attached to cross-origin/scheme-less URLs, refreshed before expiry.
- Cookies: `Secure` + `HttpOnly` + `SameSite`; no "encryption" with a public key in localStorage.
- TLS verification is never disabled, including proxy agents.
- Service worker must not cache authenticated responses across logout; no `skipWaiting` + runtime chunk rewrite that strands clients on stale config.
- CSP + security headers set; no ids/secrets in access logs; rate-limit; container ports not bypassing the proxy.

## HTTP client & data contract

- Non-2xx is an error, not data: reject on it, set request timeouts, and surface failure — never a silent empty state.
- Stale-response guards: carry the requested id/key through to fulfillment; ignore out-of-order responses.
- No success toast / modal close on a failed mutation; reset prior entity state on selection change.
- Validate/parse API values before use — nullable/string numbers reaching `.toFixed`/`.map`/`.charAt` blanks the UI.
- Method/origin match the API: no POST to a GET-only route, no scheme-less origin.
- Export/jobs: sanitize sheet/column names; fail loudly on shape mismatch; cover the edge cases.

## Runtime robustness

- Error boundaries wrap the page and major subtrees — one thrown panel must not blank the app.
- Every async surface has loading / empty / error states; a failed poll keeps the last good view.
- Time/environment-dependent features work outside the happy window (office hours, offline, reconnects).

## Error handling (global)

- One owner per failure: a single global layer catches, normalizes, logs, and decides — components do not each re-handle (no duplicate toasts, logs, or sign-outs).
- Handlers exist at every level: process/global (`window.onerror`, `unhandledrejection`; Node `uncaughtException`, `unhandledRejection`), router/app error page, component/subtree error boundaries, and the data layer (one API interceptor).
- Classify every status/kind, never one generic message: network/timeout, 400/422 validation, 401 auth, 403 permission, 404 missing, 409 conflict, 429 throttle, 5xx server — each maps to a user message and a recovery action (retry, re-auth, back, report).
- Never swallow: no empty `catch`, no `console.error` stripped in prod; log with context (request id, route) server-side and report to the error tracker.
- Retry only when a retry can succeed (transient), with backoff — never infinite retry, never retry a deterministic failure.
- Fallback UI: an error page/boundary with reset/retry; keep the last good view instead of blanking; the global handler is itself guarded so it cannot crash.
- Hygiene: user-facing text leaks no stack traces, secrets, or internal ids; global handling does not mask real failures in dev.

## Realtime & maps

- Rebuild layers/scenes when upstream data changes — not on hover/zoom/tick; one client per connection; reconnect only on real change; no duplicate clients; reset stale state on re-join.
- Keep heavy math off the main thread; no O(N²) scans or pagination; scope selectors and hooks.

## CI / container / deploy

- A quality gate runs before the production image (lint + typecheck + tests) and is not skipped via Dockerfile/`.dockerignore`.
- Workflows: `concurrency` set, actions SHA-pinned, secrets step-scoped, least-privilege permissions.
- Container: fail fast on missing/placeholder env, correct escaping, no swallowed errors; healthcheck; memory/heap limits; non-root PID 1; no EOL base image; verified toolchain tarball.
- Logs structured and retained; error reporting (Sentry et al.) actually wired, not stripped in prod.
- Dirty `.dockerignore`, dependency mismatches, commented-out gates are findings, not noise.

## Maintainability & testing

- Type safety on in the data layer — no silent `any`.
- Use the project's data layer (e.g. RTK Query) instead of hand-rolled thunks/global store reads; no duplicated large handlers; delete dead code.
- A lint rule that exists must be enforced, not commented out.
- Tests import the real modules (not their own mocks), no stale compiled `.js` shadowing sources, assert behavior; critical paths have tests; a regression test must fail on the bug.
