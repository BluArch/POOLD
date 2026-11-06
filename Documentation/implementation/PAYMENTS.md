# Scheduled payments: demo and Stripe sandbox

Implemented November 6, 2026. The current v4 reward policy raises the completion-reward floor to CA$50; the 10% original-cost basis is unchanged. Existing frozen runs retain their recorded reward policy, while changed policy fingerprints require open baskets to be approved again. Both modes share the pricing, exact approval, closure, recovery, takeover, refund and payout state machines. The provider adapter handles simulated transactions or Stripe sandbox API calls. Live money movement is unconditionally disabled; this is not a production launch.

## Business flow

1. Select shares, save a payment method, then separately approve the server quote and closing time. Every saved claim edit invalidates approval, including an identical save. Item/policy/method/schedule changes are checked against immutable approval fingerprints. Card setup never approves a basket or charges groceries.
2. At/after the approved deadline, freeze and preflight the entire member-funded purchase. Missing approval, unfunded pack quantities or insufficient fixed-rate revenue blocks all initial charges. An organizer cannot charge early using Close shares. Organizer-owned shares and accepted leftovers stay outside member charges and the reward basis.
3. Charge automatically against the exact approved instructions. No manual authorizations or hold ceilings exist in this workflow. Each instruction has a stable durable operation; unknown results are reconciled before replacement. Worker claims have leases; provider requests happen outside SQL transactions.
4. A failed buyer can explicitly retry, change cards with fresh recovery consent or complete bank authentication. Defaults: two-hour initial recovery window, three user retries, then a two-hour takeover window. No failed buyer is silently dropped.
5. When takeover opens, every current member, including the organizer and affected buyer, receives a deduplicated notification and queued push delivery through the existing preference system. Offers show names/quantities, a deadline and group navigation. Card details/decline reasons are private. Claims serialize against remaining quantities; uncertain original payment attempts cannot be reassigned. A takeover is an exact, separately approved additional payment, preserving existing paid baskets. Failed replacements can retry before the takeover deadline; released reservations become available again.
6. Organizers can voluntarily buy replacement shares themselves outside the app, or cancel. Their takeover reduces the member-funded budget and reward basis; the revised grocery funding/reward requires explicit organizer confirmation before finalization. Final funding requires complete pack coverage and enough revenue after actual transaction-count costs. Timeout/cancellation refunds original and replacement payments once and blocks further charging/payout.
7. Transfer only groceries plus their cost allocation, request one net grocery payout, and wait for confirmed accessible funds before shopping. Transfer success alone does not satisfy this gate. Retain the frozen reward and its payout budget. The order lifecycle and financial lifecycle remain separate.
8. Higher store prices require an explicit supplemental proposal, new member approval/payment and additional grocery funding before purchase. Existing baskets are not charged again; no automatic top-ups or reward increases. Reductions refund the original grocery/markup/fee/tax allocations cumulatively. Completion reward remains frozen after shopping shortfalls.
9. Receipt/items proof and completed handouts (or resolution under the published no-show process) gate reward eligibility. Its distinct payout operation delivers the frozen net reward once. Provider-pending states remain pending in the UI.

Pricing is 15% goods markup, then a 5% service fee on marked-up goods. Group markup/fees are allocated deterministically in cents. One reward is max(CA$50, 10% of the paying members' original grocery cost). Current viability includes card processing and two independent payout cost budgets, excludes operating/monthly-account costs, and uses actual payer/transaction counts. Taxes remain a provisional zero-rate test policy pending the plan's merchant/tax decision. Unsupported or underfunded purchases are blocked without raising rates.

## Run locally

Use Node 24.12 or later. Apply migrations before the API/worker:

```sh
npm run db:migrate
npm run dev
```

`PAYMENTS_PROVIDER=demo` is the default. Card setup selects a clearly labeled simulated card outcome, sends no card number, and never contacts Stripe. For a demo organizer whose buyers are all sample actors, the group offers an explicit **Demo: approve sample buyers and schedule closure in one minute** action. It replaces the schedule and simulates fresh consent from those actors; a real buyer cannot be impersonated. Underfunded groups still cannot charge: use realistic funded grocery quantities rather than inflating prices or silently subsidizing the reward.

Migrations 012–015 preserve old financial tables, add scheduled profiles/approvals/batches/instructions/recovery history/operations/payouts and seed a clearly simulated CA$10,000 demo reserve. Stripe reserve allocation starts at zero and must be backed by separately verified platform-owned funds. Reserves cover post-purchase refund/reward gaps and approved supplemental costs; they do not bypass initial pricing viability. Unavailable reserves leave payouts needing attention instead of inventing funding or using another group's allocation.

## Stripe sandbox setup

Configure server-only environment variables:

```dotenv
PAYMENTS_PROVIDER=stripe_test
PAYMENTS_TEST_MODE=true
STRIPE_SECRET_KEY=                  # sk_test_ only
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=             # pk_test_ for browser authentication
PUBLIC_APP_URL=http://localhost:8081
PUBLIC_API_URL=http://localhost:4000
```

Finish or cancel existing runs before changing provider mode. Changing cards/provider invalidates open approvals. Hosted Checkout uses `mode=setup`; a later automatically captured PaymentIntent uses the saved Customer/method and `off_session=true`. After setup, use Check completed card setup or webhook/reconciliation; neither saves a basket approval. Bank authentication uses an expiring opaque link scoped to the affected instruction, Stripe.js and the server-held client secret; browser return alone never marks a payment paid.

Organizer sandbox onboarding uses hosted Express account onboarding for Canada and manual payout scheduling. Refresh payout eligibility after completing onboarding. Instant destination, transfer capability and payout eligibility are required; real availability is checked before payout. Source-linked transfers allocate each group's money, and account-scoped locks prevent concurrent group payout scheduling from spending the same allocation. Standard payout is never an automatic fallback. Unsupported eligibility remains blocked.

Point Stripe test webhooks at `/api/stripe/webhook` before the global JSON/origin/session middleware. Signatures and live-event rejection are enforced; the event inbox is durable and deduplicated. Reconciliation retrieves provider state, records actual payment fees when available and rejects mismatched amount/currency/customer/method/instruction. Transfers/payouts/refunds stay pending until confirmed. Canceled runs with a confirmed grocery bank payout record an organizer advance receivable and block new advances until an operator verifies its return. They never reverse a transfer by consuming other groups' money in the shared connected account. Refunds after grocery payout require platform reserve and organizer-advance recovery; transfer reversal success is not a guarantee of recovering money already in a bank account.

Official API references: [Checkout setup](https://docs.stripe.com/payments/save-and-reuse?platform=web&ui=stripe-hosted), [off-session payments](https://docs.stripe.com/payments/save-and-reuse), [separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [Instant Payouts](https://docs.stripe.com/connect/instant-payouts).

## Worker and reconciliation

`npm run jobs -w @poold/api` processes deadlines, durable financial operations and notifications. The API's minute timer is a local/demo convenience, not a reliable production scheduler. Before any live pilot, run this command from a durable external scheduler/worker with uptime, monitoring and recovery guarantees. Leases permit safe retries after a crash; unknown create results older than 23 hours require operator reconciliation rather than a new idempotency key.

Operational inspection uses `funding_batches`, `funding_instructions`, `funding_operations`, `funding_payouts`, `funding_revisions`, `funding_takeovers`, `funding_reserve_allocations`, `funding_advance_recoveries`, `stripe_events` and the balanced journal. `unknown` is not failed, `pending` is not paid, and no status implies a real bank arrival without provider confirmation. Deferred operations log only their business key, kind and error type, not credentials, client secrets or card data.

Legacy `holds`, authorization quotes and payment records are retained, never converted into new consent. Closure refuses existing groups with outstanding legacy activity. Reconcile/cancel the old sandbox provider objects and associated balances explicitly before migrating those groups; new groups use the scheduled path. Never rename old migrations or erase money history to enable a run.

## Validation and remaining launch requirements

Automated coverage checks exact quotes, fixed rates/reward boundaries, organizer exclusions, early closure rejection, same-basket edit invalidation, full-batch approval, retry, group notifications, takeover races, cancellation/refund deduplication, unknown provider outcomes, separate grocery/reward payout timing, price-change consent and signed webhooks. Stripe SDK requests are exercised with controlled provider responses; this is not evidence of real bank settlement.

A real Stripe sandbox account still needs end-to-end validation of hosted setup, authentication, webhook delivery, Connect onboarding, pending source availability, Instant Payout eligibility, partial failures, refunds/reversals and reserve funding. Merchant/tax treatment, contracted provider fees, launch approval, operational alerts/reserves and deployment scheduling remain phase 0/pilot dependencies. Production Stripe calls are blocked regardless of environment credentials.
