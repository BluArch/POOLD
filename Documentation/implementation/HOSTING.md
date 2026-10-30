# Free hosting for POOLD

Live October 30, 2026: **Render Free** for Express and the Expo web app, **Aiven Free MySQL** for persistent data, and **Brevo Free** for verification mail.

- App: **https://poold.onrender.com**
- API base: **https://poold.onrender.com/api**
- Health: **https://poold.onrender.com/api/health**
- [Render dashboard](https://dashboard.render.com/web/srv-dbi5h5dg1s2s73e2f990)
- [Aiven database](https://console.aiven.io/account/a5eedab9b0d8/project/poold/services/poold-mysql/overview)

This preserves the current MySQL transactions and constraints. Firebase Functions requires the billing-enabled Blaze plan, and Firestore would require a database rewrite. Supabase uses PostgreSQL, requiring a migration. Vercel Hobby's daily cron limit does not fit the existing minute-based reminders. Koyeb's current signup/billing requirements make its free instance less straightforward for a new account.

## Cloud setup progress — October 30, 2026

- Aiven service `poold-mysql` exists on the **Free** tier, running MySQL 8.4.11 in DigitalOcean San Francisco.
- Database `poold` has all three migrations applied. The `poold_app` user is restricted to that database and requires TLS. Certificate and hostname verification passed. No demo accounts or orders were seeded into `poold`.
- All **17 API tests passed against a separate Aiven `poold_test` database**, including concurrent claims, membership capacity, transactions, verification, fulfillment and reminder idempotency. Test fixtures are confined to `poold_test`, which is not accessible to the production `poold_app` user.
- Render service `poold` is **Live** on **Free**, in the Poold workspace, with manual deploys from `codex/render-aiven-hosting`. Initial deployment `dep-dbi5h5tg1s2s73e2fa30` built commit `710df3d` with Node 24.22.2, confirmed the three existing migration versions, and started on Render's port 10000. The later documentation-only commit records this live result and does not change the deployed runtime.
- Brevo email and phone verification completed. The verified sender is named **Poold**. SMTP key **POOLD production** was created with its default October 30, 2027 expiry; Brevo also expires keys after 90 days of inactivity. Mandatory STARTTLS and authentication on port 2525 passed a local live check without sending email. SMTP credentials are in Render's private environment. Actual inbox delivery and SMTP connectivity originating from Render have not yet been tested.
- Live HTTPS checks passed: MySQL health (`200`, `{ "ok": true, "database": "mysql" }`), signed-out session (`demoEnabled: false`), protected orders (`401`), missing API routes (`404`), cross-origin writes (`403`), and disabled demo/outbox routes (`404`). The root page, order deep-link HTML and JavaScript assets return successfully; missing assets return `404`.
- The hosted sign-in screen rendered with no browser errors or warnings. No cloud user account was created by deployment verification. Registration, code receipt, cookie persistence for a signed-in cloud account and a real user's order flow remain live recipient checks; the corresponding API flows passed the separate Aiven test suite.

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
7. Native Expo builds need `EXPO_PUBLIC_API_URL=https://poold.onrender.com/api` in the mobile environment, followed by a client restart/rebuild. The existing local-development mobile `.env` is retained. The hosted web build already uses same-origin `/api`. Never put private credentials in `EXPO_PUBLIC_*` variables.

Production disables demo login and the development outbox. Optional FCM stays disabled until its own credentials and native configuration are supplied. In-app notifications remain available.

## Verification

Local hosting build, lint, typecheck and 17 API tests passed against the dedicated local test database. Hosting tests cover certificate/hostname verification settings, production plaintext rejection, static/deep-link routing, API JSON boundaries, Render-origin CORS, proxy trust and the production demo guard. These do not establish live Aiven connectivity or inbox delivery.

The exported web app was also served locally from Express on one origin: its existing session loaded community groups from local MySQL, opened an order, and survived a direct order-page reload. The browser reported no errors during that check. This used the local development database and does not establish cloud health.

Live recipient checks not yet performed:

- Register, receive the email code, verify, and confirm reload preserves the session.
- Create and re-open a test order, restart the service, and confirm persistence.

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
