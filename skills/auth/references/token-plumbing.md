# Token plumbing (lib/auth/session.ts + SessionTokenSync + base query)

Three layers, one token:

- Server — session resolved in layout, passed to `SessionProvider`
- React tree — `useSession()` for UI (header, gated widgets)
- Non-React — module holder, read synchronously per API request

## `lib/auth/session.ts`

```ts
let accessToken: string | null = null;
let sessionUser: Session["user"] | null = null;

export function setSessionToken(token: string | null) {
  accessToken = token;
}

export function getSessionToken(): string | null {
  return accessToken;
}

export function setSessionUser(user: Session["user"] | null) {
  sessionUser = user;
}

export function getSessionUser(): Session["user"] | null {
  return sessionUser;
}

// signIn({redirect:false}) resolves before useSession() cache updates.
// Fetch session once: next API call carries token, non-React consumers
// (pusher/notification init) see user immediately.
export async function hydrateSessionToken(): Promise<void> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const data = await res.json();
    accessToken = data?.accessToken ?? null;
    sessionUser = (data?.user ?? null) ?? null;
  } catch {
    accessToken = null; // anonymous requests; never blocks login UX
  }
}
```

## `components/provider/SessionTokenSync.tsx`

```tsx
"use client";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { setSessionToken, setSessionUser } from "@/lib/auth";

export default function SessionTokenSync() {
  const { data: session } = useSession();
  useEffect(() => {
    setSessionToken(session?.accessToken ?? null);
    setSessionUser(session?.user ?? null);
  }, [session]);
  return null;
}
```

## `components/provider/AuthProvider.tsx`

```tsx
"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import type { Session } from "next-auth";
import SessionTokenSync from "./SessionTokenSync";

export default function AuthProvider({ children, session }: { children: ReactNode; session: Session | null }) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <SessionTokenSync />
      {children}
    </SessionProvider>
  );
}
```

## RTK Query base query — `redux/features/api/apiSlice.ts`

```ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { signOut } from "next-auth/react";
import { API_URL } from "@/app.config";
import { isProtectedRoute } from "@/lib/auth";
import { getSessionToken } from "@/lib/auth";

const baseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  credentials: "include",
  fetchFn: (input, init) => fetch(input, { ...init, cache: "no-store" }),
});

function handle401() {
  if (typeof window === "undefined") return signOut({ redirect: false });
  const currentPath = window.location.pathname;
  if (isProtectedRoute(currentPath) && currentPath !== "/login") {
    signOut({ redirect: false }).then(() => {
      window.location.replace(`/login?callbackUrl=${encodeURIComponent(currentPath)}`);
    });
  } else {
    signOut({ redirect: false });
  }
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args, api, extraOptions
) => {
  const normalizedArgs: FetchArgs = typeof args === "string" ? { url: args } : { ...args };
  const accessToken = getSessionToken();

  normalizedArgs.headers = {
    ...normalizedArgs.headers,
    Accept: "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  const result = await baseQuery(normalizedArgs, api, extraOptions);

  // No retry: nothing rotates module-holder token between attempts — retry
  // byte-identical. Add retry only alongside real refresh path (token
  // rotation); re-apply auth from new token then.
  if (result?.error?.status === 401) handle401();

  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithAuth,
  keepUnusedDataFor: 0, // backend-controlled caching only
  tagTypes: ["Profile", "Stats", /* ... */],
  endpoints: () => ({}),
});
```

Auth mutations (register, OTP, forgot-password) = plain endpoints on this slice — **no auth side effects in `onQueryStarted`**, ever. Orchestration in components; backend auth in `authorize()`.

## Pitfalls

- Missing `hydrateSessionToken()` after signIn → first post-login request anonymous → 401 → instant logout loop. #1 regression.
- Hydrate user holder too: consumers reading `getSessionUser()` right after login (pusher/notification activation) get `null` until `useSession` updates otherwise.
- 401 "retry with re-read token" against static holder = dead code — identical request. Reviewers flag as misleading; retry only when refresh path changed token.
- Don't read token from `document.cookie` — session cookie httpOnly by design.
- `refetchOnWindowFocus={false}` avoids session refetch storms; 401 ladder = real invalidation path.
