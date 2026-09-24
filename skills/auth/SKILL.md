---
name: auth
description: "Implements or migrates to NextAuth v4 credentials auth for Next.js App Router apps whose identity provider is an external REST backend issuing bearer tokens: authorize() with server-side backend calls, session-token plumbing for RTK Query/fetch layers, proxy/middleware route protection, 401 retry and sign-out ladder, OTP registration and password-reset flows, social-login token exchange, deterministic post-login redirects. Use for 'nextauth', 'auth migration', 'login not redirecting', 'stuck on login page', 'refresh fixes login', 'protect routes', 'middleware auth', 'session token', 'signIn credentials', '401 handling', 'otp login', 'social login', 'new auth integration'. NOT for OAuth-first setups, Auth.js v5, Firebase auth, or non-Next.js apps."
---

# auth

NextAuth v4 (next-auth@4.x) credentials architecture for a Next.js App Router app whose real identity provider is an external REST backend issuing bearer tokens. Followed end-to-end, it eliminates the classic bug class: login resolves, loading stops, but the redirect never fires (or only after a manual refresh).

## Pick your entry point

- **New integration** — follow the implementation sequence below, steps 1–5.
- **Migrating legacy custom auth** (localStorage tokens, cookie-presence middleware, post-login side-effect chains) — read `references/migration.md` first, then the sequence.

## Architecture at a glance

```
Browser                        Next.js server                  External backend
───────                        ─────────────                   ────────────────
signIn("credentials",
        {redirect:false})  ──► authorize()
                                 POST /login ──────────────────► access_token
                                 GET  /profile (Bearer) ───────► user
                                 maps user + accessToken
                                 + sessionDuration (JWT exp)
                               sets httpOnly session cookie ◄── one response
await hydrateSessionToken()     (GET /api/auth/session)
router.push(callbackUrl |
            referrer | "/")
```

File map (every piece exists for a reason; do not skip one):

| File | Role |
|---|---|
| `lib/auth/index.ts` | public surface — import everything from `@/lib/auth`, never deep paths |
| `lib/auth/options.ts` | `authOptions`: credentials `authorize()`, social exchange in `jwt` callback, type augmentation, `auth()` = `getServerSession` |
| `lib/api.ts` | server-side backend REST wrappers (`loginApi`/`getProfileApi`) used by `authorize()` |
| `app/api/auth/[...nextauth]/route.ts` | 4-line route handler exporting GET/POST |
| `lib/auth/session.ts` | module-level token holder + `hydrateSessionToken()` |
| `components/provider/SessionTokenSync.tsx` | `useSession` → `setSessionToken` on every session change |
| `components/provider/AuthProvider.tsx` | `SessionProvider` + `SessionTokenSync` |
| `app/layout.tsx` | `const session = await auth()` → `<AuthProvider session>` (zero round-trip bootstrap) |
| `lib/auth/routes.ts` | protected/auth route lists + helpers |
| `proxy.ts` (or `middleware.ts`) | `getToken()` signature check, redirects both directions |
| `redux/features/api/apiSlice.ts` | `baseQueryWithAuth`: Bearer from `getSessionToken()`, 401 retry once, then signOut |
| `components/auth/LoginPageClient.tsx` | signIn → hydrate → redirect chain; OTP and register steps for OTP-gated backends |

## Implementation sequence (new integration)

1. **NextAuth setup** — `lib/auth/options.ts` + route handler + env (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`). See `references/nextauth-setup.md`.
2. **Route protection** — `lib/auth/routes.ts` + `proxy.ts`. See `references/route-protection.md`.
3. **Token plumbing** — `lib/auth/session.ts`, `SessionTokenSync`, `AuthProvider`, base query. See `references/token-plumbing.md`.
4. **Flows** — login client, register auto-signIn, logout helper: `references/login-flows.md`.
5. **Optional flows** — OTP registration/forgot-password: `references/otp-flows.md`; Google/Facebook exchange: `references/social-login.md`.

## Hard rules (each fixes a real observed bug)

- **`authorize()` throws** `new Error(backendMessage)` on bad credentials — never `return null`. With `signIn({redirect:false})` the thrown message becomes `result.error` shown to the user; `null` gives a generic failure.
- **All backend auth calls inside `authorize()`, server-side.** Client-side post-login fetch chains (profile fetch → set-cookie → redirect) are the root cause of the no-redirect bug. One `signIn()` = one response = one cookie.
- **`await hydrateSessionToken()` after every successful `signIn`** (login, register auto-login, any programmatic sign-in) before any authorized request or redirect. `signIn({redirect:false})` resolves *before* the `useSession` cache updates; acting on the stale empty token sends requests as anonymous → 401 → logout loop.
- **Redirect = awaited `router.push(callbackUrl)` in the component**, never `window.location.href` buried in an API layer, never conditional on a profile fetch succeeding. Sanitize `callbackUrl` to a same-origin relative path first — it's a query param, fully user-controllable, and `router.push("https://evil.com")` navigates off-origin (open redirect).
- **Session cookie maxAge = backend token `exp`** (decode with `jose`) — always, no fallback. `authorize()` rejects tokens without a usable expiry (`'Login token has no expiry'`); a guessed lifetime (fixed 24h etc.) either kills live sessions early or leaves expired ones minted. Custom `jwt.encode` override, not the default.
- **401 ladder in the base query:** retry only if something can actually rotate the token between attempts (a refresh endpoint, a re-fetch of the session). With a static module-holder token the retry is byte-identical — skip it and go straight to `signOut({redirect:false})` + `location.replace('/login?callbackUrl=...')` gated by `isProtectedRoute()` so public pages don't bounce.
- **No token in localStorage, ever.** The only client-visible token copy is the NextAuth session; API layers read it via the module holder.
- **Social logins exchange the provider token for a backend token inside the `jwt` callback** — the provider token is never stored as the app token.

## Checklist

- [ ] `authorize()` throws with backend message; does all backend auth calls
- [ ] `hydrateSessionToken()` called after signIn and register-auto-login; sets both the token and user holders
- [ ] Redirect chain: `callbackUrl` (same-origin validated) → same-origin referrer (≠ auth page) → default
- [ ] Route guard uses `getToken()` (signature-verified), not cookie presence
- [ ] Unauthenticated on protected → `/login?callbackUrl=<path>`
- [ ] Base query: Bearer per request, 401 ladder (retry only with real token rotation), signOut fallback
- [ ] Layout passes server session into `SessionProvider`
- [ ] OTP flows: plain endpoints, no auth side effects; resend cooldown enforced
- [ ] Social: provider token exchanged for backend token before session write
- [ ] New integration: legacy-free from day one. Migration: legacy storage/cookie/route code deleted, not left dormant
