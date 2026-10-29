# POOLD API

Base URL: `/api`. JSON requests and responses. Secure web cookie or `Authorization: Bearer <session>` from a native client. All order, claim, fulfillment, request and notification endpoints require a verified account. Production HTTPS is required.

Errors have `{ "error": { "code": "CAPACITY", "message": "...", "details": [] } }`. Unsupported content types return 415; empty/invalid JSON inputs use the same structured errors. Validation returns 400, authentication 401, role checks 403, undiscoverable/private resources 404, state/capacity conflicts 409 and rate limiting 429. Private-resource failures do not reveal resource existence. Unknown fields in item updates are rejected.

## Account endpoints

| Method | Path | Input / result |
| --- | --- | --- |
| GET | `/health` | Checks MySQL; `{ok,database}` |
| GET | `/session` | `{user,demoEnabled}` |
| POST | `/auth/register` | `{name,email,password,native?}`; password 8–128 characters; verification email; creates an unverified session and returns `{user,message,token?}` (token only for native clients) |
| POST | `/auth/login` | `{email,password,native?}`; user and native-only raw token |
| POST | `/auth/verify` | Authenticated `{code,native?}`; six digits, 10-minute expiry and five guesses; consumes once and rotates the current session |
| GET | `/auth/verification` | Own code expiry, resend deadline, guesses remaining and delivery state |
| POST | `/auth/resend` | Signed-in unverified user; sends a fresh code after a 60-second cooldown |
| POST | `/auth/logout` | Revokes the current session |
| POST | `/auth/demo` | Development only; `{userId:"demo-maya",native?}`; Maya is the only demo sign-in |
| GET/PATCH | `/profile` | Own profile; PATCH `{name,photo}` where photo is a small PNG/JPEG/WebP data URL or null |

Sessions expire after 7 days. Passwords use salted scrypt; session tokens are hashed; email codes are stored as keyed HMACs bound to the account and challenge. Public user objects expose only the authenticated user's email. Organizer packing views contain display names, photos, verification badges and completed-order counts, never member emails or collection codes.

## Orders

| Method | Path | Input / result |
| --- | --- | --- |
| GET | `/orders` | `scope=discover|mine|organizing`, optional `store`, `pickup`, Vancouver calendar `date=YYYY-MM-DD`, `kind=community|quick` |
| POST | `/orders` | `OrderInput`; creates draft, never publishes implicitly; `{id}` |
| GET | `/orders/:id` | `OrderView`; optional `?invite=...`; private draft is organizer-only |
| PUT | `/orders/:id` | Complete `OrderInput`; organizer draft edits only |
| POST | `/orders/:id/publish` | Organizer review action, with future deadline and valid items |
| POST | `/orders/:id/invite` | `{email}`; in-app invitation for existing user, email link for new user |
| PUT | `/orders/:id/claims` | `{revision,attending,claims:[{itemId,quantity}]}`; replaces own selection atomically; optional invite query for first private claim |
| PATCH | `/orders/:id/items/:itemId` | Organizer `{priceCents?,available?,bought?,shortfallDecision?}` |
| POST | `/orders/:id/status` | Organizer `{status}`; lock/shop/ready/complete/cancel |
| POST | `/orders/:id/pack` | Organizer `{userId,packed}` |
| POST | `/orders/:id/arrive` | Current member with outstanding collection |
| POST | `/orders/:id/collect` | Organizer `{code}`; code must be order-scoped, unused and for a packed bag |
| POST | `/orders/:id/repeat` | Organizer `{deadline,purchaseAt,pickupAt,pickupEnd}`; new empty draft and fresh invite, no claims or publication copied |

`OrderInput` and all response types live in `packages/contracts/src/index.ts`. Dates use ISO 8601 offsets. Enforced ordering: `now < deadline <= purchaseAt <= pickupAt < pickupEnd`. Pickup must be explicitly public. The server validates every input, membership limit, item capacity, owner action and lifecycle change. MySQL parent-order row locks serialize claims, item changes and transitions.

Pack/share setup includes name, category, pack/share labels, shares per pack, pack count, integer pack-price cents, optional comparable **price per equal-sized share**, storage advice and portioning steps. No savings claim is shown without that comparable price. Estimates round half up per member/item using integer arithmetic. They do not allocate unclaimed pack portions or settle tax.

Claims are limited by available capacity and confirmed pickup attendance. An empty selection releases all shares and removes a non-organizer's membership before the deadline. Changed prices/availability increment `revision`, requiring a refreshed estimate before a new confirmation. Unavailable claims remain visible for traceability with zero estimated cost.

Lifecycle: `draft → open → locked → shopping → ready → completed`, with `cancelled` terminal. A shortfall requires an explicit proceed/skip decision before shopping. Ready requires all needed items bought and every required member bag packed. Code confirmation consumes the token atomically; repeated or concurrent reuse fails. Completion requires every available claimed bag to have been collected. A zero-claim organizer does not need a bag or collection. Item changes stop at Ready. Cancellation invalidates codes.

## Requests and updates

| Method | Path | Input / result |
| --- | --- | --- |
| GET/POST | `/requests` | List interest/vote state; create `{name,note?}` and first creator vote |
| PUT | `/requests/:id/vote` | `{voted:true|false}`; duplicate-safe |
| GET | `/notifications` | Current user's latest 100 durable alerts |
| POST | `/notifications/read` | Mark own updates read |
| PUT/DELETE | `/devices` | PUT `{token,platform}`; DELETE own `{token}` |
| GET | `/dev/outbox` | Development-only local mail inspection |

Request names are normalized and protected by a unique community/name index; votes by a request/user primary key. Interest targets suggest products and do not create a purchase promise. Job execution keys and per-user notification event keys enforce idempotency. Push delivery is independent of in-app alert persistence.

Email verification uses the OTP flow in [EMAIL_OTP.md](EMAIL_OTP.md); legacy verification links are revoked by migration 003.
