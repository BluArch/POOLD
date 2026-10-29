# Email verification with a six-digit OTP

Signup signs the user into a restricted, unverified session and opens the code-entry screen. The user enters the six-digit code from email to unlock community orders. Password sign-in returns unverified users to the same screen. Maya remains the only demo sign-in and is already verified.

Codes expire after **10 minutes**, allow **five incorrect guesses**, and are consumed once. A new code can be requested after **60 seconds**. Resending invalidates the preceding code and resets its guess count. Codes are generated with cryptographic randomness, preserve leading zeroes, and are stored as keyed HMACs bound to the user and challenge. Guess counters, resend timing, and verification consumption are serialized in MySQL transactions, so restarts and concurrent requests do not bypass them.

Copy the sender fields from the root `.env.example` into `.env` and fill them in:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-sender@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM="POOLD <your-sender@gmail.com>"
```

1. Create the Gmail sender account, turn on **2-Step Verification**, and create a Google **App Password** for POOLD. Use that app password in `SMTP_PASS`. Do not use the account's regular password. App passwords may be unavailable for some managed or protected accounts. [Google app-password instructions](https://support.google.com/accounts/answer/185833).
2. Fill these settings in **`POOLD/.env`**, not the mobile `.env`. Spaces in a Gmail app password are removed automatically. No credentials belong in `EXPO_PUBLIC_*` variables. `SMTP_FROM` is optional for this configuration and defaults to `POOLD <SMTP_USER>`.
3. Restart the Node API after editing `.env`: stop the API terminal and run `npm run dev -w @poold/api` from POOLD. Mobile settings do not need to change. Environment-file edits are not automatically reloaded by the source watcher.
4. Run `npm run mail:verify -w @poold/api`. This checks SMTP connection and authentication without sending an email.
5. Sign up in the app or sign in to your existing unverified account. Select **Send verification code** / **Resend code**, then enter the six digits you receive. Check Spam if necessary.

Gmail uses `smtp.gmail.com` and port 587 with STARTTLS, or port 465 with immediate TLS (`SMTP_SECURE=true`). [Google SMTP settings](https://support.google.com/mail/answer/7104828), [Nodemailer transport documentation](https://nodemailer.com/smtp).

`SMTP_URL` remains supported for other providers and takes precedence over the separate host settings; it requires `SMTP_FROM`. Configure one form at a time. Incomplete SMTP settings fail visibly rather than silently falling back to local delivery. A rejected or failed send is shown as a delivery failure, not "email sent"; signup still keeps the unverified account so sending can be retried after fixing settings.

## Local development without a sender

Leave the SMTP fields blank. Codes are written to `.local/mail-outbox.jsonl`, with owner-only file permissions; no external email is sent. The app clearly labels this delivery mode. Authentication responses do not include the code, and the app does not display it automatically. The development-only outbox inspection endpoint remains available when demo mode is enabled. Developers can inspect the latest matching outbox record locally.

A private development HMAC key is created once at `.local/otp-secret` and reused across API restarts. Keep it private. Production requires a server-only `OTP_SECRET` containing 64 random hexadecimal characters, generated with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into the root `.env`. Changing this key invalidates outstanding codes. Production also requires real SMTP configuration; there is no production outbox fallback.

## API and migration

Migration `003_email_otp.sql` adds `email_verifications` and revokes outstanding legacy verification links. It preserves accounts and orders. Run `npm run db:migrate` before starting the updated API. Existing unverified accounts simply request a new code in the app.

- `GET /api/auth/verification`: authenticated user's delivery state, expiry, resend deadline and guesses remaining.
- `POST /api/auth/resend`: authenticated user; creates a fresh code after the cooldown. Returns delivery metadata, or a structured delivery/rate-limit error.
- `POST /api/auth/verify`: authenticated user; `{ "code": "012345", "native": true }`. Successful verification rotates the current session and returns the verified user. The client account cannot be selected with a submitted email or user ID.
- Signup returns the unverified session and verification metadata even when sending fails, so the account remains recoverable.

No numeric code is accepted as a sign-in password. This flow verifies email ownership after password authentication; it does not replace account sign-in.

## Verification limits

MySQL/API tests cover successful confirmation, expiry, leading zeroes, user scoping, attempt locking, concurrent guesses, session rotation, replay, resend replacement/cooldown, restart persistence and mail failure/retry. Gmail SMTP connection and authentication passed a local live check without sending an email. Actual inbox delivery still needs a live recipient check.
