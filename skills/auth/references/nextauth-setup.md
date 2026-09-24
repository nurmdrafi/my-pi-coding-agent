# NextAuth setup (lib/auth.ts + route handler)

## Route handler — `app/api/auth/[...nextauth]/route.ts`

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

## Backend API wrappers — `lib/api.ts`

Plain server-side fetch, no auth headers, error messages surfaced:

```ts
const BASE_URL = process.env.API_URL;

const apiFetch = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let message = "Something went wrong";
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch {
      if (response.status >= 500) message = "Service temporarily unavailable";
    }
    throw new Error(message); // ← becomes result.error on the client
  }
  return (await response.json()) as T;
};

export const loginApi = (mobile: string, password: string) =>
  apiFetch<string>(`${BASE_URL}/login`, {
    method: "POST",
    body: JSON.stringify({ mobile, password }),
  });

export const getProfileApi = (accessToken: string) =>
  apiFetch<Profile>(`${BASE_URL}/getdetails`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
```

## `lib/auth.ts`

```ts
import { getServerSession, NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { decodeJwt } from "jose";
import { getProfileApi, loginApi } from "./api";

const FALLBACK_SESSION_MAX_AGE = 24 * 60 * 60; // backend token has no exp

const extractTokenExpiry = (token: string): number | null => {
  try {
    const { exp } = decodeJwt(token);
    if (!exp) return null;
    const remaining = exp - Math.floor(Date.now() / 1000);
    return remaining > 0 ? remaining : null;
  } catch {
    return null;
  }
};

const mapProfileToAuthUser = (profile: Profile, accessToken: string) => ({
  id: String(profile.id),
  name: profile.name ?? "",
  email: profile.email ?? null,
  accessToken,
  sessionDuration: extractTokenExpiry(accessToken) ?? undefined,
});

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        mobile: { label: "Mobile", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.mobile || !credentials?.password) return null;
        try {
          const accessToken = await loginApi(credentials.mobile, credentials.password);
          const profile = await getProfileApi(accessToken);
          return mapProfileToAuthUser(profile, accessToken);
        } catch (err) {
          // THROW, don't return null — the message reaches the client
          throw new Error(err instanceof Error ? err.message : "Invalid credentials");
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  jwt: {
    // Cookie dies with the backend token, not on a fixed schedule
    async encode({ secret, token, salt }) {
      const maxAge = (token?.sessionDuration as number) || FALLBACK_SESSION_MAX_AGE;
      const { encode } = await import("next-auth/jwt");
      return encode({ secret, token, maxAge, salt });
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) return { ...token, ...user } as unknown as JWT; // first sign-in
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.user = {
        id: token.id as string,
        name: token.name as string | null,
        email: token.email as string | null,
      };
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login", signOut: "/" },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};

export const auth = () => getServerSession(authOptions);
```

## Type augmentation (same file or `types/next-auth.d.ts`)

```ts
declare module "next-auth" {
  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    accessToken?: string;
    sessionDuration?: number;
  }
  interface Session {
    accessToken?: string;
    user: { id: string; name?: string | null; email?: string | null };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    sessionDuration?: number;
  }
}
```

## Env

```
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://your-app.example   # canonical origin
API_URL=<external backend base url>     # server-side only, no NEXT_PUBLIC
```

## Pitfalls

- Social providers: add inside `providers[]` and handle `account?.access_token` in the `jwt` callback by exchanging for a backend token first — never store the provider token as the app token.
- `session.accessToken` exposure is intentional (RTK needs the raw bearer). The cookie holding it is encrypted; still treat it as a credential in logs/analytics.
- next-auth v4 works on Next 16 via the App Router route handler above; do not mix in v5 (`next-auth@5`/Auth.js beta) imports — different API surface.
