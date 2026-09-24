# OTP flows (registration + forgot password)

For backends that gate registration or password reset behind one-time passwords.
All endpoints are plain mutations on the shared API slice — no auth side effects
in `onQueryStarted`, no token handling. Orchestration lives in the client
component's step machine.

## Endpoints (types + API slice)

```ts
// types
interface CheckUserExistenceRequest { email?: string; mobile?: string }
interface CheckUserExistenceResponse { status: string; message: string; http_code: number }
interface SendOtpRequest { mobile: string; resend: number; storeId: number; eventType: string; rtoken?: string }
interface VerifyOtpRequest { storeId: number; mobile: string; otp: string }
interface SignupRequest { /* account fields */ password: string; mobile: string; otp: string }
interface ForgotPasswordSendOtpRequest { email?: string; mobile?: string; rtoken?: string }
interface ResetPasswordRequest { email?: string; mobile?: string; otp: string; newPassword: string; confirmPassword: string; rtoken?: string }
```

```ts
export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    checkUserExistence: builder.mutation<CheckUserExistenceResponse, CheckUserExistenceRequest>({
      query: (data) => ({ url: AUTH.CHECK_USER_EXISTENCE, method: "POST", body: data }),
    }),
    sendOtp: builder.mutation<OtpResponse, SendOtpRequest>({
      query: (params) => ({ url: AUTH.SEND_OTP, method: "POST", params }),
    }),
    verifyOtp: builder.mutation<OtpResponse, VerifyOtpRequest>({
      query: (data) => ({ url: AUTH.VERIFY_OTP, method: "POST", body: data }),
    }),
    signup: builder.mutation<SignupResponse, SignupRequest>({
      query: (data) => ({ url: AUTH.SIGNUP, method: "POST", body: data }),
      invalidatesTags: ["Profile"],
    }),
    forgotPasswordSendOtp: builder.mutation<OtpResponse, ForgotPasswordSendOtpRequest>({
      query: (data) => ({ url: AUTH.FORGOT_SEND_OTP, method: "POST", params: data }),
    }),
    resetPassword: builder.mutation<{ success: boolean; message?: string }, ResetPasswordRequest>({
      query: (data) => ({ url: AUTH.RESET_PASSWORD, method: "POST", body: data }),
    }),
  }),
});
```

## Flow A — registration embedded in login

Step machine state: `"initial" | "password" | "otp" | "registration"`.

1. **Identifier submit** → `checkUserExistence({ mobile })`:
   - `http_code === 200` → existing user → step `"password"` (normal credentials login)
   - `http_code === 404` → new user → **not an error**; fall through to send OTP
   - other → `toast.error(result.message)`
2. **Send OTP** (new users): `sendOtp({ resend: 0, storeId, mobile, eventType: '<signup otp event>', rtoken })` → step `"otp"`. Attach a CAPTCHA token if the backend requires one; abort silently if the challenge fails.
3. **Verify OTP**: `verifyOtp({ mobile, otp, storeId })` → hold the OTP in state → step `"registration"`.
4. **Registration form** → `signup({ ...accountFields, mobile, otp })` → then immediately:
   `signIn("credentials", { mobile, password, redirect: false })` → `hydrateSessionToken()` → redirect chain. No separate "please log in" step.

Resend OTP reuses step 2 with `eventType: '<account edit otp event>'` and a visible
cooldown (typically 60s) so users can't spam the endpoint.

## Flow B — forgot password

Step machine state: `"initial" | "otp-verification" | "reset"`.

1. Identifier input → detect phone vs email client-side (`/^01[0-9]{9}$/`-style and
   email regex) → `forgotPasswordSendOtp({ mobile } | { email, rtoken })`.
2. OTP arrives → `verifiedOtp` held in state → step `"reset"`.
3. `resetPassword({ mobile|email, otp: verifiedOtp, newPassword, confirmPassword })` → redirect to `/login` with a success toast.

Both flows show the current step's form only; back buttons walk the machine
backwards; every failure path goes through `extractErrorMessage(error, fallback)`.

## Pitfalls

- Existence-check 404 is a routing signal, not an error — don't let the mutation's error branch swallow the new-user path.
- The OTP value must ride from the verify step into the signup/reset call via component state, not a second backend round-trip.
- Keep resend cooldown state per identifier; resetting it on step change invites abuse.
