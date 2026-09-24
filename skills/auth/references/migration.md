# Migration: legacy custom auth → NextAuth credentials pattern

Legacy shape being replaced (any subset): token in localStorage (often AES-
"encrypted" with a `NEXT_PUBLIC` key — obfuscation, not security), a helper that
POSTs to an internal set-cookies route so middleware can see auth state,
presence-only middleware cookie checks, and post-login side-effect chains
(profile fetch → cookie write → `window.location.href`) inside API-layer hooks.

## Legacy symptom → root cause (why you're migrating)

| Symptom | Legacy root cause |
|---|---|
| Loading stops but redirect never fires | Redirect conditional on a post-login profile fetch that can fail silently (null user, `!res.ok`, network error) while the auth cookie was already set |
| Login "works" only after manual refresh | Middleware sees auth cookie + public login route → bounces to the app; the client-side redirect was the broken half |
| First request after login returns 401 | Mutation promise resolves on the HTTP response, not on session hydration; side-effect chain still in flight |
| Instant logout right after login | 401 handler fires on that unauthenticated first request |
| Forged-cookie access to protected shells | Middleware checked cookie presence; cookie content was client-mintable |

## Migration sequence

**Phase 0 — inventory (before writing any new code)**

```bash
# token storage keys and readers
rg -n "localStorage|secureStorage|getItem\(" lib components redux hooks
# internal cookie routes
rg -ln "set-cookies|clear-cookies|Set-Cookie" app
# auth side effects in API layer (the bug class)
rg -n "onQueryStarted" redux
# presence-only route guards
rg -n "cookies.get" proxy.ts middleware.ts
```

Record: every reader of the stored token/user, every writer, every redirect
call site, the logout path, and the 401 handler.

**Phase 1 — build alongside (zero user impact)**

Add the full new stack (sequence in SKILL.md steps 1–4) without touching
legacy: `lib/auth/options.ts` + route handler, session-token plumbing, `AuthProvider`,
`auth-routes.ts`. The NextAuth cookie is additive; legacy cookie/storage still
work. The base query change is the only shared piece — land it behind a
feature flag or a separate exported slice if the legacy token must keep working
during the window.

**Phase 2 — cut over (one surface per deploy)**

Order minimizes broken windows:

1. **Login form** → `signIn("credentials", ...)` + `hydrateSessionToken()` + redirect chain. Both cookies exist now; either authenticates.
2. **Route guard** → `proxy.ts` rewrite with `getToken()`; delete the presence check. Keep the legacy cookie readable (don't clear it) so already-logged-in sessions survive until natural expiry.
3. **API base query** → read `getSessionToken()`, drop the legacy storage read. Existing sessions without a NextAuth cookie get the 401 ladder → re-login once. Acceptable; announce if needed.
4. **Logout** → `signOut({ redirect: true, callbackUrl })` + cleanup helper.
5. **Register / forgot-password / OTP** → rewire submit handlers onto the step machines (`references/otp-flows.md`); endpoints themselves usually don't change.

**Phase 3 — delete legacy (do not leave it dormant)**

Remove everything Phase 0 recorded: storage keys + crypto helpers, internal
cookie routes, `setAuthData`/`clearAuthData`-style helpers, side-effect blocks
in `onQueryStarted`, dead redirect call sites, and their tests. Then sweep the
seams: `rg -n "<removed export>"` for every deleted export (a leftover
`import { STORAGE_KEYS }` after deleting the constant is a typecheck failure
that `ignoreBuildErrors` silently hides), and run `npx tsc --noEmit` — the
error count must not grow versus baseline. Dormant legacy auth code is the #1
source of "ghost sessions" reported months later.

**Phase 4 — parity verification (all must pass)**

- [ ] Login → redirect lands without refresh, on slow network too (throttle in devtools)
- [ ] Wrong password → backend message surfaces, button re-enables
- [ ] Deep link to protected route logged-out → `/login?callbackUrl=` → returns after login
- [ ] Logged-in visit to `/login` → bounced to app, not a second session
- [ ] Session outlives a hard refresh; dies with backend token expiry
- [ ] 401 mid-session → sign-out → login with return path (retry only if token rotation exists)
- [ ] Logout clears the NextAuth cookie and the app shell
- [ ] Register (if OTP-gated) → auto-login → redirect, no manual step
- [ ] Social buttons (if present) → exchange → session → redirect

## Rollback

Each Phase 2 step is independently revertable if the legacy path was kept
 compiling through the window. Revert order = reverse of cut-over. After
Phase 3 deletion, rollback = redeploy previous release; keep the migration
commits granular (one surface per commit) so that stays cheap.
