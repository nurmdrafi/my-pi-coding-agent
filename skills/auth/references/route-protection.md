# Route protection (proxy.ts + lib/auth/routes.ts + layout bootstrap)

## `lib/auth/routes.ts` — single source of truth

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
import { isProtectedRoute, isAuthRoute } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Authenticated users pushed away from auth pages, back to where they came from
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

  // Unauthenticated on protected pages → login with return path
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

Explicit matcher beats catch-all regex: no exclusions to maintain, middleware runs only where decision matters.

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

Server-resolved session into `SessionProvider` → first paint already knows auth state — no initial `/api/auth/session` fetch, no auth-state flash on protected shells.

## Pitfalls

- `proxy.ts` **is** the middleware on Next 16+ (root-level convention, exported function named `proxy`). Don't report as dead wiring because `middleware.ts` doesn't exist — pre-16 same file is `middleware.ts`, export named `middleware`. Verify wiring by version, not filename.
- `getToken()` verifies cookie signature — replaces presence-only checks (`request.cookies.get('token')`), forgeable with devtools.
- Public pages that must stay reachable logged-out (e.g. `/tracking`) simply absent from matcher.
- Never put `/api/auth/*` in matcher — NextAuth routes must not be intercepted.
