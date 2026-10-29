# MVP implementation and verification — October 29, 2026

Phases A–E are implemented in the active POOLD repository. The earlier prototype and design-lab folders remain separate. Payment-related behavior is excluded. No push, deployment, cloud provisioning, billing activation, or app-store submission was performed.

## Phase coverage

| Phase | Implemented | Evidence |
| --- | --- | --- |
| A — Foundation | Expo 58 app, Node API, three MySQL migrations, shared types/schemas, salted password hashes, verified email, revocable sessions, native SecureStore/web HttpOnly cookies, profile name/photo and completed-order counts, development accounts and outbox | Foundation integration test; actual MySQL persistence across API recreation; compiled API health check; app sign-in |
| B — Organize | Create/edit draft, pack/share setup, public pickup suggestions and confirmation, ordered dates, group cap 2–10/default 6, private invites, publish review, one-item quick split | Organizer integration test; UI created and published a new order |
| C — Claim | Store/place/date/kind discovery filters, category filters, quantity review, attendance, My Orders, edits/releases, integer-cent estimates, price revision checks, transaction rollback and serialized capacity | Concurrent last-share/last-slot integration tests; Jordan claimed 2 shares through the UI and saw $6.00 and updated capacity |
| D — Fulfill | Locked/shopping/ready/completed lifecycle; unfilled-pack decisions; consolidated checklist; item price/unavailability changes; member packing lists; packed/arrived/collected states; unpredictable single-use codes; repeat into a draft | Full fulfillment and separate unavailable-item integration tests; complete organizer/member UI walkthrough |
| E — Communicate | Product suggestions, unique votes and interest targets, durable scoped updates and invites, idempotent deadline/pickup jobs, Maps walking URLs, device registration and optional Firebase Admin/native FCM integration | Requests, invitations, job concurrency, device ownership and test push-sender integration tests; UI request/vote persistence and notification read states |

The implementation uses a single UVic pilot community. Manual repetition creates a draft with fresh dates and an invite; it never publishes automatically. Unavailable claims remain visible with zero estimated cost. An organizer with no shares can finish after every required member bag is collected. Completing an organized order counts toward the organizer's completed-order profile even if they did not claim a bag.

## Automated checks

- **15/15 integration/configuration scenarios passed**, against the dedicated `poold_test` MySQL database. These are multi-step tests with assertions across registration, six-digit OTP expiry/guess limits/resend cooldown and replacement, delivery failure/retry, verification replay, persistence, session revocation, production demo guards, consistent JSON validation/rate-limit errors, cross-origin writes, draft privacy, invalid dates/caps, concurrent claims and membership joins, failed-claim rollback, editing/releases, late writes, unauthorized organizer actions, estimate rounding, stale price revisions, unavailability, shortfall decisions, shopping/packing checks, collection replay/concurrency, completion, repetition, duplicate requests/votes, private invitations, scoped notifications, UTC timestamps, device ownership and repeated/concurrent jobs.
- ESLint and TypeScript passed for API, mobile and shared contracts.
- Expo Doctor: **20/20 checks passed**.
- Shared contracts and the API compile; the compiled API launched and returned `{"ok":true,"database":"mysql"}`.
- Expo export succeeded for **web, iOS and Android**. This proves bundling, not device behavior.
- Native iOS build succeeded and installed to **iPhone 17 / iOS 26.5 simulator**. The SDK/vendor build emitted warnings; this was not a warning-free build. Native folders were generated through Expo config and are ignored.
- Tests and the final root build were run with Node **24.22.2**. Earlier development and the first native build used Node 22.13. The documented runtime is Node 24.12+ to satisfy Firebase's declared dependency engines.
- `git diff --check` passed. The pre-existing `.DS_Store` change was left alone.

Generated logs and screenshots are local development artifacts and are excluded from version control. Reproduce the automated checks with `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

## Email OTP update

Email verification now uses six-digit codes instead of links. Signup retains the restricted session and opens a dedicated OTP screen with resend/expiry states. The code is HMAC-protected, valid for 10 minutes, limited to five guesses, and resend-limited for 60 seconds. Gmail SMTP sender fields were added to the root environment example; see [setup and behavior](EMAIL_OTP.md). A local SMTP connection/authentication check passed with the configured Gmail App Password; it did not send an email. Inbox delivery remains unverified. Tests use local mail sinks and do not send to external recipients.

## Demo account update

The demo entry now offers Maya only. The seed retains the other sample organizers as data actors with demo access disabled and revokes their previous demo sessions. Multi-user integration checks use ordinary verified test fixtures; the historical UI walkthrough below was recorded before this change.

## Observed full UI demonstration

Using the actual Expo app against the development MySQL API in the in-app browser:

1. Maya created **MVP walkthrough pantry**, with a 4 kg rice pack, four 1 kg shares, CAD $12 estimated pack price, public UVic pickup, and explicitly ordered deadline/purchase/pickup dates. Saved a draft, reviewed and published it.
2. Signed out, signed in as Jordan, found that published order, selected two shares, reviewed the CAD $6 estimate and confirmed pickup attendance. Remaining capacity changed from four to two; the order appeared in My Orders.
3. Switched to Maya. The dashboard showed Jordan's commitments. Acknowledged the two unfilled shares, locked the order, started shopping, checked off the pack and marked Jordan's labeled bag packed.
4. Opened pickup. Jordan's own screen showed a collection code and packed state. Jordan marked arrival; Maya's view showed the arrival.
5. Maya entered Jordan's code and confirmed the handoff. The dashboard showed one bag packed and one collected. Completed the order; it appeared in history and Jordan's completed-order count became one.
6. Created **Frozen blueberries** through the contextual Requests entry point. Vote/unvote changed the count 1 → 0 → 1; the request and vote survived a full app reload.
7. Updates displayed claim, lifecycle, arrival and completion events. Mark all as read persisted. A discovered timezone mismatch was fixed by setting each MySQL connection to UTC, and regression-tested against the host's PDT MySQL setting.
8. A development API restart produced a connection error. Retry restored the session and app, verifying the recovery entry point.

Observed assisted timings: **107 seconds** from beginning the filled standard-order setup to publication, and **18 seconds** from opening the new order to confirming shares. The organizer timing included a tooling/input correction. These are tool-assisted functional walkthrough measurements, not representative usability study results or proof of the two-/ten-minute targets for new users.

## Visual evidence

The rendered app retains white surfaces, slate type, neutral separators, a vertical group list and exactly Community / My Orders / Organize as visible tabs. Requests and organizer/member capabilities remain available contextually. Navigation labels and last scrollable controls remain clear of the bottom bar at the observed 416 × 766 browser viewport. The approved image was used to check palette, list anatomy and tab structure; this is not a claim of pixel-identical reproduction of sample data or additional screens that were never user-approved.

Local screenshots captured Community, the completed organizer dashboard, the completed order header, Requests, and Updates. These images are excluded from version control.

## Explicit limits

- **Native interaction is partially verified.** The initial build/install check could not inspect the UI because the Mac was locked. Subsequent checks opened the native sign-in screen, confirmed Maya is the only demo option, exercised password show/hide with a sample value, and inspected the six-digit OTP screen. The full native order flow, photo selection, SecureStore persistence across relaunch and physical-device flows still need a hands-on run. No Android SDK/emulator was available; Android bundling succeeded but a native Android build/run was not performed.
- **FCM is configurable and disabled by default.** No Firebase project/native files, server credentials or APNs credentials were supplied. Registration and sending code typecheck and the server queue was exercised with a test sender. No live push delivery, permission flow or notification tap on a configured device is claimed. In-app notifications work independently.
- Google Maps URLs are generated for public pickup destinations. No embedded map, GPS distance estimate or native navigation walkthrough is claimed without provider/device configuration.
- Email was exercised with a local outbox/test mail sink. SMTP delivery was not verified with a real external recipient.
- The API production dependency audit reports **0 vulnerabilities**. The whole workspace audit still reports **8 inherited Expo tooling findings (5 low, 3 high)** from the CLI's Zod 3 dependency and Expo config's deepmerge dependency. The app/API use patched Zod 4.6.7. gRPC is pinned to the patched compatible 1.14.6 line. Do not treat this local MVP as an audited production release; review vendor fixes before release. No forced SDK downgrade was applied to silence these findings.
- Docker configuration is provided as an alternative; local verification used the isolated Homebrew MySQL 8.4.13 instance rather than Docker.
- No actual student/organizer usability study, native device push test, deployment or app-store release was performed.
