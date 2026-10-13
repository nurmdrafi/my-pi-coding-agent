# Social login (Google / Facebook token exchange)

Social buttons never authenticate user directly against app backend. Provider's access token is **exchanged for a backend bearer token** inside NextAuth `jwt` callback; everything downstream (session, API calls, protection) identical to credentials login.

## Provider config (`lib/auth/options.ts`)

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

Social sign-ins use provider's redirect dance — `redirect: false` doesn't apply. Provider returns to `NEXTAUTH_URL/api/auth/callback/<provider>`; NextAuth honors `callbackUrl` (same-origin only, by design).

Exchange happens server-side in callback → landing request already carries session — no `hydrateSessionToken()` on social path (still required after credentials `signIn({redirect:false})`).

## Pitfalls

- Never store provider token as app token; backend wouldn't accept it.
- Wrap exchange in try/catch returning bare token on failure — exception in `jwt` callback breaks every subsequent session read, not just social login.
- `callbackUrl` must be same-origin or NextAuth silently drops it.
- Test provider callback URL registration against exact `NEXTAUTH_URL` origin (http/https and www mismatches = usual failure).
