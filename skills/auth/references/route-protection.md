# Route protection (proxy.ts + auth-routes + layout bootstrap)

## `lib/auth-routes.ts` — single source of truth

```ts
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/orders",
  // ...
] as const;

export const AUTH_ROUTES = ["/login", "/forgot-password"] as const;

export const isProtectedRoute = (pathname: string): boolean =>
  PROTECTED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const isAuthRoute = (pathname: string): boolean =>
  AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
```

## `proxy.ts` (Next 16 middleware name)

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isProtectedRoute, isAuthRoute } from "@/lib/auth-routes";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Authenticated users are pushed away from auth pages, back to where they came from
  if (isAuthRoute(pathname) && isAuthenticated) {
    const referer = request.headers.get("referer");
    let redirectPath = "/";
    if (referer) {
      try {
        const refererPathname = new URL(referer).pathname;
        if (!isAuthRoute(refererPathname)) redirectPath = refererPathname;
      } catch {
        // invalid referer → default
      }
    }
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // Unauthenticated users on protected pages → login with return path
  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // protected prefixes
    "/dashboard/:path*",
    "/settings/:path*",
    // auth routes
    "/login",
    "/forgot-password",
  ],
};
```

Explicit matcher beats a catch-all regex: no exclusions to maintain, middleware
runs only where the decision matters.

## Layout bootstrap — zero round-trip session

```tsx
// app/layout.tsx (server component)
import { auth } from "@/lib/auth";
import AuthProvider from "@/components/provider/AuthProvider";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body>
        <AuthProvider session={session}>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

Passing the server-resolved session into `SessionProvider` means the first paint
already knows auth state — no initial `/api/auth/session` fetch, no auth-state
flash on protected shells.

## Pitfalls

- `getToken()` verifies the cookie signature — replaces presence-only cookie checks (`request.cookies.get('token')`), which anyone can forge with devtools.
- Public pages that must stay reachable logged-out (e.g. `/tracking`) simply don't appear in the matcher.
- Do not put `/api/auth/*` in the matcher — NextAuth routes must not be intercepted.
