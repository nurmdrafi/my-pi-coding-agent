# Social login (Google / Facebook token exchange)

Social buttons never authenticate the user directly against the app backend.
The provider's access token is **exchanged for a backend bearer token** inside
the NextAuth `jwt` callback; everything downstream (session, API calls,
protection) is identical to credentials login.

## Provider config (`lib/auth.ts`)

```ts
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";

providers: [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
  FacebookProvider({
    clientId: process.env.FACEBOOK_CLIENT_ID!,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.picture?.data?.url, // Facebook nests it
      };
    },
  }),
]
```

## Backend exchange in the `jwt` callback

```ts
const handleSocialLogin = async (
  provider: "google" | "facebook",
  providerToken: string
) => {
  const accessToken = await socialLoginApi(providerToken, provider); // POST /social-login
  const profile = await getProfileApi(accessToken);                  // same profile call as credentials
  return mapProfileToAuthUser(profile, accessToken);                 // id, name, email, accessToken, sessionDuration
};

callbacks: {
  async jwt({ token, user, account }): Promise<JWT> {
    // Social sign-in: first jwt invocation carries account.access_token
    if (account?.access_token) {
      if (account.provider === "google" || account.provider === "facebook") {
        const socialUser = await handleSocialLogin(account.provider, account.access_token);
        return { ...token, ...socialUser, provider: account.provider } as unknown as JWT;
      }
    }
    // Credentials sign-in
    if (user) return { ...token, ...user, provider: "credentials" } as unknown as JWT;
    return token;
  },
  // session callback unchanged: session.accessToken = backend token
}
```

## Client trigger

```tsx
const handleGoogleLogin = async () => {
  let callback = callbackUrl || "/"; // resolve like the credentials flow
  await signIn("google", { callbackUrl: callback }); // full-page redirect, NOT redirect:false
};
```

Social sign-ins use the provider's redirect dance, so `redirect: false` doesn't
apply. The provider returns to `NEXTAUTH_URL/api/auth/callback/<provider>` and
NextAuth then honors `callbackUrl` (same-origin only, by design).

Because the exchange happens server-side in the callback, the landing request
already carries the session — no `hydrateSessionToken()` needed on the social
path (still required after credentials `signIn({redirect:false})`).

## Pitfalls

- Never store the provider token as the app token; the backend wouldn't accept it.
- Wrap the exchange in try/catch returning the bare token on failure — an exception in the `jwt` callback breaks every subsequent session read, not just social login.
- `callbackUrl` must be same-origin or NextAuth silently drops it.
- Test the provider callback URL registration against the exact `NEXTAUTH_URL` origin (http/https and www mismatches are the usual failure).
