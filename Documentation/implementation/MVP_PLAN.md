# POOLD MVP plan

Status update — October 29, 2026: the user explicitly authorized implementation of all phases A–E, one by one, with no commits. The MVP source, MySQL schema/migrations, local example data, API contract and setup instructions are now implemented. See [verification and current limits](VERIFICATION.md) and [setup](SETUP.md). Live Firebase/SMTP delivery and native interaction still require configuration/device checks described there. No commits, push, deployment or cloud provisioning were performed.

Historical planning note: the minimalist group-list home and neutral Community / My Orders / Organize navigation were selected before implementation. The user's subsequent instruction to implement the MVP superseded the earlier design-review pause; it did not change functional scope or the payment exclusion.

## 1. Product goal and authoritative sources

Deliver a working React Native app in which a student can discover a nearby bulk order, claim a manageable share, track that order, and collect it. An organizer must be able to create the order, shop from a consolidated list, pack individual bags, and confirm handoff.

Use the supplied architecture: **React Native → Node.js API → MySQL**, with Google Maps for pickup directions and Firebase Cloud Messaging for push notifications. Expo is the proposed React Native development framework; confirm its native notification setup during the technical setup phase.

Source priority:

1. The user's current instructions: review designs before implementation; exclude all payment-related work.
2. The approved presentation rules in section 3, the supplied mobile mockups, and the architecture screenshot. Visual references guide presentation; they do not replace functional requirements.
3. `Documentation/requirements_document.pdf` and the customer-discovery/persona documents.
4. The live Figma prototype and repository screenshots, followed by issue descriptions/comments.

Repository reviewed: README, all five documentation PDFs, both interview PDFs, all six repository images, and all 20 issues including the four issue discussions with comments. The live Figma editor became accessible, but a complete interactive walkthrough has not yet been completed. The supplied eight screen exports provide the primary visual reference for this plan.

Discovery takeaway: organizer willingness is less established than member demand. Prioritize a short, clear organizer workflow and test it with actual potential organizers.

## 2. Firm scope boundaries

### Include in the MVP

- Accounts, verified email, profile name/photo, and completed-order count.
- Community discovery and filtering by store, pickup place, and date.
- Organizer-created community orders and simple one-item quick splits.
- Public groups and private groups accessed through an invite link.
- Item pack sizes, share sizes, available quantities, and estimated product costs in CAD.
- Claim, edit, and release shares before the deadline, with pickup attendance confirmation.
- Organizer dashboard, shopping checklist, per-member packing lists, and pickup confirmation.
- Product requests and one vote per member per request. This feature remains in scope even though Requests is not a top-level tab in the approved navigation.
- In-app updates, deadline closure/reminders, pickup reminders, and FCM integration when configured.
- A repeat-order shortcut that creates a new draft with new dates. Automatic weekly publication is deferred.

### Exclude entirely for now

- Payment collection or tracking, paid/unpaid states, e-transfer instructions, card storage, Stripe, holds, payouts, fees, refunds, organizer compensation, receipt reconciliation, and payment-related scheduled jobs.
- Tax settlement or final billing. Any displayed share cost is a product-price estimate only.
- Delivery, route optimization, in-app chat, ratings/reporting, receipt OCR, and a full retailer product catalogue.
- Automatic substitutions and automatic recurring order publication.

Google Maps/FCM account creation, credentials, billing activation, deployment, and app-store submission are separate configuration/release steps. Do not invent credentials or claim external integrations work without live verification.

## 3. Approved design rules and remaining screen review

### Decision recorded October 29, 2026 — presentation only

The user selected the clean, minimalist white/slate design and requested a list of groups instead of a Previous/Next group carousel. The supplied bottom-tab reference establishes the three-destination structure and icon/label arrangement only. The user explicitly rejected copying its lavender palette; navigation must use the selected design's neutral white/slate palette.

- **Visual style:** white surfaces, dark slate text, muted secondary text, restrained blue links, readable typography, generous but practical spacing, and thin separators. Keep branding modest. Avoid decorative panels and unnecessary visual density.
- **Community home:** a vertically scrollable group list. Each group presents its name, organizer/store, pickup place/time, membership availability, and a concise item preview. Tapping a group opens its full details and item/share selection. Do not require Previous/Next controls to discover other groups.
- **Bottom navigation:** exactly three persistent top-level destinations, in this order: **Community / My Orders / Organize**. Use recognizable community, shopping-bag, and storefront outline icons, each with a visible text label.
- **Tab styling:** a white bar with a fine neutral-gray top divider, dark slate active icon/label, and muted gray inactive icons/labels. If an active-icon pill is used, its fill must be a barely visible neutral gray. No lavender, purple tint, or coloured navigation background. Match the approved white/slate screen rather than importing colours from the structural reference.
- **Accessibility and layout:** provide comfortable touch targets, sufficient contrast, and bottom safe-area clearance. The bar must not obscure scrollable content or required actions. The native home indicator/device frame in the reference is system chrome, not an app feature.
- **Existing actions:** My Orders retains the member's shares/order/pickup functions. Organize retains group creation and management. Their names and visual placement do not change their capabilities.

The approved group-list direction, bottom-tab structure reference, and neutral white/slate home mockup were retained locally during development. Reference images are excluded from version control; the design rules above describe the selected direction.

### Functional scope must remain intact

**These rules change presentation and navigation only. They must not add, remove, weaken, or redefine any feature, acceptance criterion, permission, data model, state transition, or business rule.** The feature scope in section 2 and implementation/verification requirements in sections 5–7 remain authoritative. The prior explicit payment exclusion also remains in effect.

A capability absent from a simplified mockup is not removed from the MVP. In particular, product requests/voting, quick splits, discovery filters, private invites, account verification, profile details, notifications, deadline handling, item availability/price changes, shopping/packing tools, pickup confirmation, and the repeat-order shortcut must remain accessible through appropriate screens or contextual entry points. The three-tab decision does not require a fourth Requests tab, and it does not remove Requests.

Example names, dates, displayed groups, and member counts in a design are sample content, not changes to limits, deadlines, recurrence behavior, or other product rules. If a layout cannot accommodate a required capability clearly, adjust the layout or add an appropriate entry point; do not silently drop the capability.

The following screen set still needs coherent review using the approved visual rules:

| Screen | Required capabilities to preserve in the design |
| --- | --- |
| Community home | Scrollable group list with clear store, deadline, pickup, capacity and group entry. Preserve access to quick splits and discovery filters without requiring every control to appear in the initial viewport. Avoid unsupported savings claims. |
| Products | Category filters, share availability, quantities already claimed, clear entry to choosing an amount. |
| Claim amount | Small usable portions, remaining capacity, product-cost estimate and pickup confirmation. Remove fees, card-charge language and payment promises. |
| My order | Item quantities, order status, edit cutoff, estimated product cost and pickup details. Remove card/hold/refund content. |
| Organizer dashboard | Commitments and three practical steps: shop, pack, hand out. Remove collected-money and reimbursement content. |
| Shopping and packing | Consolidated store checklist and per-member packing lists with progress. Remove cards, receipt settlement and payout sections. |
| Pickup | Location, time, packed/collected states, collection code and organizer confirmation. No paid badge or release-of-payment copy. |
| Requests | Product suggestions, vote/unvote, progress toward a configurable interest target. Reaching a target suggests an item; it does not promise a purchase. |
| Create/edit group | Store, dates, public pickup, visibility, group cap and item/share setup; pre-publish review. |
| Account and updates | Sign-in/verification, profile, notifications and useful empty/error states. |

Include loading, empty, full, expired, unavailable-item, offline/retry, changed-price and completed states. Use accessible type sizes, contrast, touch targets, safe areas and keyboard behavior.

**Design gate:** the home/navigation styling is selected. Review the remaining screen flow before app implementation; this visual approval alone does not authorize changing functional scope.

## 4. Product decisions to resolve in the design review

Use these proposed defaults unless the user/team chooses otherwise:

- **Group size:** default 6, hard maximum 10, as specified in FR-7. The supplied examples showing 43 members represent a different scale and must not silently override this rule. Validate a larger limit with the team before adopting it.
- **Community versus quick split:** same underlying order model; a quick split contains one item and is presented separately in discovery.
- **Recurring orders:** label an order with its intended cadence, but use manual duplication into a draft for the MVP. Do not imply automatic repetition is active.
- **Requests:** keep product requests and voting, with an appropriate contextual entry point within the approved three-tab structure. Use a configurable interest target. The mockup's target of 30 is illustrative and may not suit a small pilot.
- **Unfilled packs:** show the shortfall and require an organizer decision before shopping. Do not imply that an incomplete pack is automatically purchased, cancelled or charged.
- **Savings:** show only when a comparable reference price and quantity are entered; label it as an estimate and omit it otherwise.
- **Pickup:** organizer verifies a single-use collection code and marks the order collected; provide a manual code-entry fallback to camera scanning.

## 5. Technical implementation sequence, after design approval

### Phase A — Foundation

- Set up the React Native/Expo app, Node.js API and a dedicated MySQL development database.
- Commit a versioned SQL schema, migrations, environment examples and reproducible setup instructions.
- Establish shared API types and consistent error handling.
- Implement secure account/session handling, email verification, profile updates and server-side access checks.
- Store native session credentials securely; do not ship secrets in the app bundle.
- Provide clearly labeled local demo accounts and a development email outbox. Disable demo shortcuts in production.

Completion: the app launches, can authenticate against the API, and retains data through an API restart.

### Phase B — Organizer creates an order

- Build create/edit draft, item/share setup, visibility, invite links and publish review.
- Validate ordering/purchase/pickup dates and recommended public pickup places.
- Set maximum membership and capacity rules on the server.

Completion: a newly published open order appears to another account; a private order requires its invite or existing membership.

### Phase C — Member discovers and claims

- Build Community, product list, quantity selection and My orders.
- Calculate estimated item costs on the server; use integer cents and consistent rounding.
- Use MySQL transactions and row locks to prevent simultaneous overclaims or membership overfill.
- Support edits/releases before the deadline, with a clear confirmation summary.

Completion: two different users can claim portions; remaining capacity updates correctly; late or excessive claims are rejected.

### Phase D — Shop, pack and collect

- Build the organizer dashboard and order-state transitions.
- Generate shopping totals and each member's packing list from committed quantities.
- Add item unavailable/price-change handling, shopping checklist and packed status.
- Add pickup location/directions, arrival indication, single-use code validation and collected status.
- Finish an order only when the required pickup checks are satisfied.

Completion: an organizer can take a real test order from committed shares to confirmed collection without leaving the app for coordination tasks.

### Phase E — Requests and communication

- Add product suggestions and duplicate-safe vote/unvote.
- Persist in-app notifications for invites, changed items, deadline and pickup events.
- Run idempotent scheduled jobs to close expired orders and issue reminders; enforce deadlines on API writes as well.
- Open Google Maps directions for the selected public pickup location; add in-app map/distance features only when provider configuration is available.
- Register device push tokens and send through Firebase Cloud Messaging when the Firebase project and native builds are configured. Keep in-app notifications usable independently.

Completion: requests persist, repeated jobs do not duplicate alerts, and configured push/map behavior is verified on the appropriate device/build.

## 6. Data and state model

Core entities: users, verification tokens, sessions, communities, orders, order items, memberships, share claims, shopping checklist entries, packing status, collection tokens, product requests, request votes, notifications, device tokens and job execution records.

No payment, card, fee, payout, refund or billing tables/endpoints.

Proposed order lifecycle:

`Draft → Open → Locked → Shopping → Ready for pickup → Completed`

Cancellation is a separate terminal state. A deadline locks claims; it does not automatically start shopping. Packing progress is tracked per member. Collection tokens must be scoped to the order/member, unpredictable and single-use.

Discovery exposes only the minimum public information. Private group membership, member profiles, packing lists and collection codes are restricted by role. Exact private addresses are not published by default.

## 7. Verification and acceptance

- Test real MySQL persistence, migrations and the API, including rollback on failed claims.
- Test concurrent claims for the last share and simultaneous joins for the last membership slot.
- Test organizer/member separation, private invites, unauthorized data access, invalid dates and expired deadlines.
- Test duplicate requests/votes, duplicate job runs and repeated collection attempts.
- Check the full member and organizer flows in the app, including navigation, keyboard/safe-area behavior and failures/retries.
- Compare approved designs against rendered screens at matching dimensions.
- Verify native behavior on iOS and Android when available; an Expo web preview does not prove native camera, secure storage or push delivery.
- Observe whether members can join and commit in under 2 minutes and organizers can set up a standard order in under 10 minutes. Report observed timings rather than assuming the targets are met.

Final demo: organizer creates/publishes → second account joins/claims → organizer locks/shops → marks items bought and bags packed → member views pickup code → organizer confirms collection → completed order appears in history. Include a separate unavailable-item test.

## 8. Handoff

Deliver the approved design set, source code, schema/migrations, seeded example data, API documentation, environment examples, startup instructions, focused test results and an honest list of integration limits. Keep commits scoped and reviewable. No push, deployment, cloud provisioning or app-store submission is part of this planning step.

Current handoff: run the implemented MVP using SETUP.md, review the rendered flows and verification evidence, then perform the listed native/provider checks before any release.
