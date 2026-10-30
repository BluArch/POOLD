# Free hosting for POOLD

Selected October 29, 2026: **Render Free** for Express and the Expo web app, **Aiven Free MySQL** for persistent data, and **Brevo Free** for verification mail. Deployment is pending account access and live cloud verification.

This preserves the current MySQL transactions and constraints. Firebase Functions requires the billing-enabled Blaze plan, and Firestore would require a database rewrite. Supabase uses PostgreSQL, requiring a migration. Vercel Hobby's daily cron limit does not fit the existing minute-based reminders. Koyeb's current signup/billing requirements make its free instance less straightforward for a new account.

## Cloud setup progress — October 30, 2026

- Aiven service `poold-mysql` exists on the **Free** tier, running MySQL 8.4.11 in DigitalOcean San Francisco.
- Database `poold` has all three migrations applied. The `poold_app` user is restricted to that database and requires TLS. Certificate and hostname verification passed. No demo accounts or orders were seeded into `poold`.
- All **17 API tests passed against a separate Aiven `poold_test` database**, including concurrent claims, membership capacity, transactions, verification, fulfillment and reminder idempotency. Test fixtures are confined to `poold_test`, which is not accessible to the production `poold_app` user.
- The Render **Free** service form is prepared in the Poold workspace with branch `codex/render-aiven-hosting`, production configuration and database secrets. The service has not yet been submitted/deployed.
- Brevo email identity verification passed. SMTP key creation is waiting on Brevo's required phone verification. A working sender and SMTP authentication still need verification before the app is deployed.

Cloud account credentials are kept out of Git and documentation. Temporary local setup files are under ignored `.local/hosting` with private credential file permissions.

## Cost and limits

| Component | Selected tier | Main limit |
| --- | --- | --- |
| Render web service | Free, explicitly set in `render.yaml` | Sleeps after 15 minutes without incoming traffic; waking takes about a minute. 750 instance hours per workspace/month. |
| Aiven MySQL | Free, not a paid trial | 1 GB storage, 1 GB RAM, one node, 76 connections; unused services may be powered off after notification. |
| Brevo email | Free | 300 sends/day; sender verification and transactional-email activation required. |

These are currently $0 tiers within their limits, suited to the course MVP/demo. Render's free database expires after 30 days, so it is deliberately not used. No paid resource is declared in the Blueprint.

**Sleep affects jobs:** deadline writes remain protected by database checks. Deadline closure, reminders and push dispatch run on startup and every minute while awake; they cannot run while Render sleeps. Reminders may arrive late. This setup does not promise continuously running or precisely timed reminders.

## Provision and deploy

1. Sign in to Render and Aiven. Create an Aiven **MySQL Free** service; avoid trial/paid plans. Use a fresh database, without local development accounts. Copy the MySQL URI and download the project CA certificate. Use a dedicated application database/user when available; the deployment user needs the schema permissions required by the migrations.
2. Create a Brevo Free account, verify the sender, and activate transactional email. Copy its SMTP login and **SMTP key**. Render Free blocks ports 25, 465 and 587; the Blueprint selects Brevo's **2525**, with mandatory STARTTLS in POOLD's mailer. Verify connection/authentication and actual recipient delivery after deployment. Never configure unencrypted SMTP.
3. The hosting changes are on GitHub branch `codex/render-aiven-hosting`. Create a Render Blueprint from POOLD, that branch, and `render.yaml`. Keep the service on **Free**. Automatic deploys are disabled; deploy reviewed revisions manually. Alternatively, a manually configured web service must use that branch, repository-root working directory, the build/start commands below, and `/api/health` as its health check.
4. Supply the private server variables when prompted:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Aiven `mysql://...` URI, including assigned port and database |
   | `DATABASE_CA_CERT` | Complete CA PEM contents, including real newlines |
   | `OTP_SECRET` | 64 random hexadecimal characters, generated below |
   | `SMTP_USER` | Brevo SMTP login |
   | `SMTP_PASS` | Brevo SMTP key, not its HTTP API key |
   | `SMTP_FROM` | `POOLD <your-verified-sender@example.com>` |

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Keep secrets out of Git/chat. Render's generated secrets use base64, so `OTP_SECRET` is deliberately manual to match the existing hex validation.

5. The Blueprint builds with `npm ci --include=dev && npm run build:host`, then runs `npm run start:host`. Startup applies migrations before listening; it never seeds demo users. The MySQL migration lock prevents concurrent migration execution. Free hosting runs migrations in the start command without a paid pre-deploy job.
6. Render supplies `RENDER_EXTERNAL_URL`, used as the allowed browser origin and invitation URL. Web requests use `/api`, keeping HttpOnly cookies on the same origin. For a custom domain, set `APP_ORIGIN` and `PUBLIC_APP_URL` to its HTTPS origin. `STATIC_WEB_DIR=../mobile/dist` is relative to the API workspace used by the start command.
7. Native Expo builds need `EXPO_PUBLIC_API_URL=https://<actual-render-host>/api` in the mobile environment, followed by a client restart/rebuild. Never put private credentials in `EXPO_PUBLIC_*` variables.

Production disables demo login and the development outbox. Optional FCM stays disabled until its own credentials and native configuration are supplied. In-app notifications remain available.

## Verification

Local hosting build, lint, typecheck and 17 API tests passed against the dedicated local test database. Hosting tests cover certificate/hostname verification settings, production plaintext rejection, static/deep-link routing, API JSON boundaries, Render-origin CORS, proxy trust and the production demo guard. These do not establish live Aiven connectivity or inbox delivery.

The exported web app was also served locally from Express on one origin: its existing session loaded community groups from local MySQL, opened an order, and survived a direct order-page reload. The browser reported no errors during that check. This used the local development database and does not establish cloud health.

Before declaring deployment complete:

- Open the actual HTTPS app and `/api/health`; expect `{ "ok": true, "database": "mysql" }`.
- Confirm Aiven TLS connectivity and all three migration records.
- Register, receive the email code, verify, and confirm reload preserves the session.
- Create and re-open a test order, restart the service, and confirm persistence.
- Confirm production rejects `/api/auth/demo` and `/api/dev/outbox`.
- Open an order deep link and check for browser/asset errors.

## Official references

- [Render Free limits](https://render.com/docs/free)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Aiven MySQL Free limits](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)
- [Aiven CA certificates](https://aiven.io/docs/platform/concepts/tls-ssl-certificates)
- [Brevo Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo SMTP ports](https://developers.brevo.com/docs/smtp-integration)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Vercel Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Koyeb billing requirements](https://www.koyeb.com/docs/faqs/pricing)
