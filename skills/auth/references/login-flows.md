# Login, register, logout flows + fallback inventory

## Login submit handler (client component)

```tsx
"use client";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { hydrateSessionToken } from "@/lib/session-token";

const router = useRouter();
const searchParams = useSearchParams();
const callbackUrl = searchParams.get("callbackUrl");

const handleSubmit = async (mobile: string, password: string) => {
  const result = await signIn("credentials", { mobile, password, redirect: false });
  if (result?.error) {
    toast.error(result.error); // message thrown from authorize()
    return;
  }
  await hydrateSessionToken(); // BEFORE any authorized request or redirect
  toast.success("Login successful!");
  await handleLoginSuccess();
};

// Redirect chain: explicit callback → same-origin referrer (≠ auth page) → default
const handleLoginSuccess = async () => {
  if (callbackUrl) return router.push(callbackUrl);
  if (typeof document !== "undefined" && document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      if (
        referrerUrl.origin === window.location.origin &&
        !referrerUrl.pathname.includes("/login")
      ) {
        return router.push(referrerUrl.pathname + referrerUrl.search);
      }
    } catch {
      // invalid referrer → default
    }
  }
  return router.push("/"); // default destination (e.g. "/dashboard" for admin panels)
};
```

Button loading state lives in the component (`isLoading` true on submit, false
in catch, **left true on success** — navigation unmounts the page). Never
derive the redirect from a mutation's fulfillment; `signIn` is the only await.

## Register → auto-login

```tsx
const result = await signup(signupData).unwrap();
if (result) {
  await signIn("credentials", { mobile: data.phone, password: data.password, redirect: false });
  await hydrateSessionToken();
  toast.success("Account created successfully!");
  await handleLoginSuccess();
}
```

No "please log in now" step. Errors normalize through
`extractErrorMessage(error, "Registration failed")`.

## Error normalization helper (use everywhere)

```ts
function extractErrorMessage(error: unknown, fallback: string): string {
  if (
    error && typeof error === "object" && "data" in error &&
    error.data && typeof error.data === "object" &&
    "message" in error.data && typeof (error.data as { message: unknown }).message === "string"
  ) {
    return (error.data as { message: string }).message;
  }
  return fallback;
}
```

## Logout helper

```ts
import { signOut } from "next-auth/react";

export async function handleLogout(callbackUrl: string = "/") {
  try {
    // app-specific cleanup here (push subscriptions, storage keys to preserve)
    await signOut({ redirect: true, callbackUrl });
  } catch (error) {
    console.error("Logout error:", error);
    await signOut({ redirect: true, callbackUrl }); // unconditional fallback
  }
}
```

## Fallback inventory

| Where | Fallback |
|---|---|
| Session cookie maxAge | backend JWT `exp` → else 24h |
| Login redirect | `callbackUrl` → same-origin referrer (≠ auth page) → default route |
| Auth-page redirect (proxy) | referer path if non-auth → `/` |
| `authorize()` failure | thrown backend message → `result.error` → toast; `null` only for missing input |
| Backend error text | `data.message` → 5xx "Service temporarily unavailable" → "Something went wrong" |
| 401 on API call | retry once with re-read token → `signOut` + `/login?callbackUrl=` (public pages: silent signOut) |
| `hydrateSessionToken` | fetch fail → token `null` → anonymous requests, login proceeds |
| Logout | try/catch → unconditional final `signOut` |
| Post-login deferred intents (e.g. buy-now) | keep intent in sessionStorage; target page replays it after session hydrates — don't act while `useSession` is still stale |

## Pitfalls

- Multi-second `setTimeout` before redirect — never; await the chain instead.
- Acting on `useSession()` immediately after `signIn` resolves — cache is stale; that's what `hydrateSessionToken` is for.
- Forgetting `callbackUrl` propagation through proxy redirects loses the user's place.
