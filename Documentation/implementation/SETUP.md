# Run the POOLD MVP

For cloud deployment, see [free hosting with Render and Aiven](HOSTING.md).

The current implementation is in `apps/mobile` (Expo SDK 58 / React Native), `apps/api` (Node / Express), `packages/contracts` (shared schemas and types), and `db/migrations` (MySQL 8.4). No cloud account is required for local development. All prices are estimated product prices in CAD.

## Local setup

Use Node 24.12 or newer (see `.nvmrc`; the API and Expo were also validated with Node 22.13, but optional Firebase JavaScript dependencies declare Node 24.12). Install MySQL 8.4 or Docker.

```sh
npm ci
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

`db:local` requires `mysqld` and `mysql` on PATH. It creates an isolated instance in `.local/mysql`, bound to `127.0.0.1:3308`, with `poold_dev` and `poold_test`. It does not touch a system MySQL database. Its deliberately local credentials are in `.env.example`. To stop this instance: `mysqladmin --no-defaults --socket="$PWD/.local/mysql.sock" -uroot shutdown`.

Alternatively, use `docker compose up -d --wait` in place of `npm run db:local`. The compose file binds MySQL to loopback on the same port and initializes both databases. Do not run both options together. To stop without deleting data: `docker compose stop`.

Open [the Expo web preview](http://localhost:8081). The API health route is [here](http://localhost:4000/api/health). Development sign-in offers one explicitly labeled sample account: **Maya**. Other sample organizers are retained as order data only; they cannot use the demo sign-in endpoint. Re-seeding retires their old demo sessions while preserving order history. Seeded orders contain no fake claims; all counts come from database rows. Restarting the API preserves accounts, orders, claims, updates, and sessions. Re-running seed does not reset orders.

The UI follows Community / My Orders / Organize, with contextual access to requests, account, updates, private invites, claims, and organizer tools. Drafts need review and publication. A quick split has exactly one item. Group capacity includes the organizer, defaults to 6 and cannot exceed 10.

## Verification and email

Signup and unverified sign-in open a **six-digit OTP screen**. Codes expire after 10 minutes, allow five guesses, and can be resent after 60 seconds. See [email OTP and Gmail setup](EMAIL_OTP.md) for the root `.env` settings and testing steps.

Without SMTP, codes and new-account invitations go to `.local/mail-outbox.jsonl`; no external email is sent. Existing-account invitations arrive in Updates. Development exposes `/api/dev/outbox`, which is disabled in production.

For production, set `NODE_ENV=production`, `DEMO_ENABLED=false`, HTTPS `APP_ORIGIN` / `PUBLIC_APP_URL`, SMTP settings, a random `OTP_SECRET`, and separately provisioned database credentials. Production refuses to start without a sender or OTP secret. Demo endpoints and the outbox endpoint are disabled regardless of `DEMO_ENABLED`. Do not reuse development data or credentials in production.

Native session bearer credentials use Expo SecureStore. Web uses a SameSite Strict HttpOnly cookie, scoped to `/api`, with Secure enabled in production. Keep the web app and API on the same site in production. SMTP, database, OTP and Firebase Admin secrets belong only on the server; `EXPO_PUBLIC_*` values are public app configuration.

## Native builds

```sh
npm run ios -w @poold/mobile
npm run android -w @poold/mobile
```

Those commands launch Expo. Use a native development build for Firebase push:

```sh
cd apps/mobile
npx expo run:ios
# or, with Android SDK / emulator installed:
npx expo run:android
```

On the iOS simulator, API localhost is the Mac. On an Android emulator use `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api`. On a physical device use the computer's LAN IP and a trusted local network. Production must use HTTPS. CocoaPods and Xcode are needed for local iOS builds; native folders are generated and ignored. Firebase 27 uses dynamic framework linkage configured by `expo-build-properties` in `app.config.ts`.

## Optional Firebase Cloud Messaging

In-app notifications and all order flows work without Firebase.

1. Supply your own Firebase project and native files. Set `GOOGLE_SERVICES_JSON` for Android and `GOOGLE_SERVICES_PLIST` for iOS to absolute local file paths in the mobile environment. Set `EXPO_PUBLIC_FCM_ENABLED=true`, then rebuild the native app. iOS also requires configured APNs credentials in Firebase.
2. On the API, set `FCM_ENABLED=true` and `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase Admin service-account file outside the repo. Application Default Credentials are also supported. No account provisioning or billing changes are performed by this code.
3. In Account, select Enable push on this device and allow notifications. The client obtains an **FCM registration token** through React Native Firebase on both platforms; APNs tokens are never sent to the FCM sender.
4. Verify on the configured device: receive an order change, tap it to open the order, refresh the registration token, sign out, and verify delivery stops for that account/device. These live delivery checks have not been performed without credentials.

The API uses a transactional notification outbox, bounded retries and invalid-token cleanup. Push delivery is at least once: provider/network failures after delivery can result in a duplicate push. Durable in-app alerts and scheduled reminders are duplicate-safe. Disabling push or signing out unregisters the device from the account.

## Jobs and directions

The API runs deadline closure and reminder jobs on startup and once per minute. `npm run jobs -w @poold/api` runs one cycle manually. Database event keys prevent duplicate in-app alerts across repeated/concurrent runs. Write endpoints independently enforce deadlines. Deadline reminders are issued within 24 hours; pickup reminders within 2 hours. A passed deadline locks shares; it never starts shopping automatically. Set `REQUEST_INTEREST_TARGET=3` (1–100) to tune request interest targets.

Walking directions use Google Maps URLs for the selected public pickup location. They require no Maps API key. Distance estimates or embedded provider maps are intentionally not shown without provider configuration.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx expo-doctor # from apps/mobile
```

Tests require a database URL ending in `/poold_test`; they refuse to run against the development database. They migrate this test database, create uniquely scoped test records and remove test orders. They exercise real MySQL transactions, simultaneous claims/joins, access controls, deadlines, rollback, packing requirements, collection replay, requests, jobs, and a test push sender. The generated API runs via `npm run start -w @poold/api` after build. Shared contracts compile during `npm ci` and before the root build.

See `API.md` for the endpoint contract and `VERIFICATION.md` for tested behavior, evidence and current limits. Nothing here requires a commit, deployment, paid service or app-store submission.
