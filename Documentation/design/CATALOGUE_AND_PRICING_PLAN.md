# POOLD multi-store catalogue and pricing plan

Date: November 5, 2026. Status: implementation plan only; no catalogue import, schema change, external provisioning or payment integration has been performed. Keep this plan uncommitted. Pricing details are owned by [the payment plan](STRIPE_PAYMENTS_PLAN.md), section 3.

## 1. Requested outcome and confirmed scope

Organizers can choose **Costco, Real Canadian Wholesale Club, Bulk Barn or Walmart**, select the purchasing branch, search its products and add them to a group without retyping the product details. Treat the selector as “Choose a store”; Walmart is supported even though it is a general retailer and some products have no bulk discount.

The user confirmed: **import all product records; enable ordering only for grocery and household products**. Import the complete available, authorized Canadian source catalogue for each chain, including non-orderable categories. Do not silently replace this request with a curated 50–100-product list. Furniture, electronics, clothing and other out-of-scope records remain stored with their source categories and explicit non-orderable reasons. They are excluded from the ordinary organizer product picker.

Product metadata, local store assortment, price and orderability are separate concepts. A national online catalogue is not proof that every item is sold at a Victoria branch. “Complete” is always qualified by retailer, source, country, channel, branch coverage and successful import date. Offline-only or inaccessible assortment gaps remain visible as gaps.

Initial geographical scope is Greater Victoria. Register Costco Langford, Wholesale Club on Viewfield Road, verified local Bulk Barn branches and verified Walmart branches through their location sources. Keep source location IDs and addresses; do not infer branch identities from a product page's default postal code. The design must support more locations without duplicating the whole product catalogue.

For the first release, one group buys from **one retailer and one branch/channel**, preserving the current single-store shopping run and one organizer payout. Cross-store comparison is allowed; a multi-stop group is a later product decision, not an automatic consequence of importing four catalogues.

## 2. Revised pricing recommendation

Use store acquisition cost plus an explicit group service fee. The fixed $50 organizer payment, payout costs, overhead and operating allowance are shared in proportion to members' purchasing subtotals; each member also covers their modeled card-processing cost. There is no separate car allowance and no automatic 20% item uplift. Final calculation is frozen and captured only when the group closes.

Why this improves on the earlier options:

| Option | Benefit | Main weakness |
| --- | --- | --- |
| Flat 20% uplift on every item | Easy to explain | Can underfund a small run, overcharge a large run and erase thin item savings |
| Charge according to the retail-price gap | Protects a chosen share of reference savings | Needs reliable comparison data for every SKU and makes charges depend on reference selection |
| Store cost plus a disclosed group service fee | Auditable; relates charges directly to the $50/run and payment costs | Requires a minimum viable group and clear estimated/maximum fees while membership changes |

Recommend the third option. Comparison prices report actual value to members; they do not determine how much POOLD can charge. Do not claim a saving when comparison coverage is missing or the all-in price is higher. Prefer groups achieving at least 10% verified basket savings during the pilot, while allowing an honestly labeled convenience purchase under explicit price consent. Any minimum-savings guarantee actually promised to a group remains a hard condition.

This replaces the prior per-item half-savings allocation as the recommended policy. The complete calculator, monetary ceilings, rounding, formation terms and examples are in the payment plan. Nothing in the catalogue ingestion process can change an already authorized policy or amount ceiling.

## 3. Establish access before promising complete catalogues

No complete, reusable Canadian catalogue feed for all four retailers has been verified in this work. Build adapters around confirmed capabilities, not guessed endpoints or an assumption that registering for a seller API grants access to another retailer's entire assortment.

| Retailer | Data required | Source validation work |
| --- | --- | --- |
| Costco | Canadian product/item IDs, pack composition, full product metadata, Langford assortment and warehouse prices | Seek an authorized export/feed or provider explicitly covering Costco Canada and local warehouse offers. Preserve CostcoGrocery/Same-Day as separate channels. Online coverage alone cannot complete warehouse coverage. |
| Wholesale Club | Product IDs, case/each variants, categories, Viewfield branch offers and promotions | Validate an authorized retailer/provider export or permitted catalogue ingestion with explicit branch selection. Do not substitute a default branch or assume a food-service case contains the same count as a retail pack. |
| Bulk Barn | Bulk item codes, all categories, price basis, product/allergen metadata, branch offers and fixed-pack variants | Confirm feed/export or permitted website access. Bulk items may lack a consumer UPC and use per-100-g/per-kg pricing; neither is a missing “pack price” to invent. |
| Walmart | Canadian first-party and any source-provided marketplace metadata, categories, GTIN/item IDs, local branch offers, seller/channel | Validate a licensed catalogue/search source that permits database storage and local offer use. Marketplace seller management APIs are not a verified feed for the entire Canadian in-store assortment. Third-party shipping offers may be stored but are not local grocery shopping offers. |

Relevant official evidence:

- [Walmart Canada Marketplace onboarding](https://developer.walmart.com/ca-marketplace/page/getting-started) requires seller approval/credentials; [catalogue search documentation](https://developer.walmart.com/global-marketplace/docs/catalog-search-for-the-seller-catalog) describes a seller catalogue. Neither establishes POOLD's access to all Canadian branch offers.
- [Instacart Developer Platform FAQ](https://docs.instacart.com/developer_platform_api/faq/) describes name-based matching and limitations on choosing a merchant/exact SKU. Its [Catalog APIs](https://docs.instacart.com/catalog/catalog_api/overview) send a retailer's own product/offer data into Instacart. These are not proof of a full catalogue export to POOLD.
- [Costco's Same-Day pricing policy](https://sameday.costco.ca/store/costco-canada/pages/pricing-policy) says prices are higher than warehouse prices. Never reverse a guessed percentage to fabricate a shelf price.
- [Bulk Barn's published product listing](https://www.bulkbarn.ca/en/Products/All) advertises location-dependent selection; direct retrieval returned an error during this review. Catalogue and branch-price accessibility must be validated rather than assumed from search snippets.

Preferred source order: retailer-authorized feed/export, licensed provider with the needed storage/branch rights, then permitted bounded public-catalogue ingestion. Confirm ability to retain product descriptions, identifiers, images/references, price observations and update history. Do not bypass access controls or treat unconfirmed provider APIs as implemented. If only discovery or shopping links are available, record that limitation and continue the database/UI work; the full import remains incomplete.

Phase 0 must produce a source capability record per retailer: access method, sample response/export, Canadian coverage, branch/channel fidelity, enumeration/pagination/count support, update/delete semantics, rate limits, retention/display rights, recurring cost and named unresolved gaps. Validate with provider documentation or an actual authorized sample. This phase documents prerequisites; account registration, purchases and retailer outreach have not been performed during planning.

## 4. Database model

Extend the existing MySQL API and shared contracts. Determine migration numbers at implementation time; existing migrations currently end at 004 and the payment work also needs migrations. Do not independently assign the same next number to both features.

| Entity | Responsibility |
| --- | --- |
| `retailers` | Four supported chains, stable slug, country and display configuration |
| `store_locations` | Source branch ID, address, region, postal code and active status |
| `catalogue_sources` | Access/licensing configuration, coverage, channel, freshness policy and provider capabilities |
| `catalogue_products` | Retailer-scoped source ID, GTIN where available, brand/title, source category, normalized category, variant/size and permitted media references |
| `product_components` | Outer pack, sealed inner units, unit dimensions and exact sellable structure; no guessed package counts |
| `store_offers` | Product, branch/channel/seller, current price reference, availability state and orderability decision |
| `price_observations` | Immutable price, currency, tax/deposit basis, price denominator, observed/source time, promotion expiry, evidence and verification scope |
| `catalogue_sync_runs` / checkpoints | Import scope, authoritative counts, source cursor, retries, received/accepted/quarantined counts, failures and completion evidence |
| `catalogue_import_errors` / mappings | Reviewable normalization failures, category mappings and identity decisions |
| Order item snapshots | Existing order item plus stable product/offer/observation references and the exact selected title, pack, price/unit basis at creation/authorization/closure |

Keep imported source IDs unique per retailer/source namespace and offer IDs unique per branch/channel/seller. Merge exact verified GTIN/size matches only when the pack level also matches. A box, a case of boxes, a different flavour and a different net weight are distinct variants. Fuzzy title similarity can suggest a match for review but cannot merge products or establish a comparison automatically.

Store money as bounded integer cents. Keep quantities as integer base units (grams, millilitres, each) or an exact documented decimal scale, never binary float money/weights. Price denominators must be explicit: cents per each, 100 g, kg, 100 mL, litre, fixed pack or source-defined selling unit. Represent deposits and tax inclusion separately. A $1.49/100-g item is $14.90/kg; never treat $1.49 as the full kilo or an arbitrary pack.

Metadata ingestion does not automatically set `orderable = true`. Use an explicit category eligibility policy for grocery/household, supported quantity/handling semantics, a valid acquisition offer and branch/channel suitability. Unsupported or uncertain categories remain stored with a reason and a review path. Third-party shipping listings are not silently mixed with first-party store pickup prices.

Current catalogue and historical financial snapshots have different retention requirements. Archiving/removing a product never deletes existing group items, authorization receipts or financial evidence.

## 5. Ingestion, full backfill and refresh

All four adapters share a contract: discover locations, enumerate products/categories, enumerate branch offers where supported, retrieve product/offer details, emit deletions/tombstones, persist checkpoints and report coverage. A capability may be unavailable; never fake the corresponding success.

Backfill workflow:

1. Import into staging using a stable source/version and location/channel scope.
2. Traverse every enumerated category/page/cursor, including non-orderable categories and variants. Persist progress after each bounded batch.
3. Normalize identities, categories, pack structures, units and offers. Preserve source records needed for permitted audit/reprocessing; quarantine bad rows with reasons rather than dropping them silently.
4. Upsert idempotently into catalogue and current-offer projections. Keep observations immutable and use source timestamps so an older delayed page cannot overwrite a newer price.
5. Reconcile source identifiers and counts against accepted, duplicate and quarantined records. Resolve count deltas and loops. “All pages fetched” is insufficient when an endpoint silently truncates results.
6. Promote a successful version atomically or switch a current-version pointer. A failed full refresh preserves the last good catalogue. Only a completed authoritative pass can infer deletions; a timeout must not mark an entire aisle unavailable.
7. Report catalogue coverage and branch-price coverage independently. Unknown stock stays unknown, not in stock or unavailable by default.

After full backfill, prefer delta feeds/change timestamps. Proposed starting schedules, adjusted to source terms/limits: metadata daily, branch price/availability refresh within 24 hours for active orderable products, and targeted refresh for a selected item before authorization and closure. A promotion must remain valid through planned shopping. Changes in cold/non-orderable product metadata can use slower source-supported schedules. Staleness is visible; no “live inventory” label without a source that actually supplies it.

Run imports in a durable worker separate from request handling and the payment capture/payout queue. Use retailer-specific rate/concurrency limits, exponential backoff, retries and checkpoint leases. Respect throttling and provider costs; an outage cannot block all other stores or starve financial jobs. Manual receipts can verify a group's acquisition estimate but do not turn into official chain-wide observations without review.

Before a full backfill, measure a representative permitted sample for row size, index cost, observation volume, source request count and media storage. Compare the projected full load against the current Aiven/Render capacity and recurring API budget. Store permitted image references rather than image binaries in MySQL. Use provider retention rules and configurable price-history retention while preserving order/financial snapshots. Provision extra capacity only after its concrete need/cost is known.

## 6. Catalogue APIs and organizer flow

Proposed read APIs under the existing API:

- `GET /retailers` and `GET /retailers/:id/locations`
- `GET /catalogue/products?retailerId=&locationId=&category=&query=&cursor=&limit=`
- `GET /catalogue/products/:id` and `GET /catalogue/offers/:id`
- Authorized group-item creation selecting a stable offer and expected observation/revision, rather than trusting an arbitrary client price
- Admin-only import status, source configuration and category/unit-review operations; no public full-catalogue export by default

Use server-side indexed search, bounded page sizes (initially 30) and cursor pagination. Apply retailer/branch/category/orderability filters before returning results; do not load four entire catalogues into the Expo bundle or client memory. Search title/brand/category/source SKU and exact barcode; add MySQL search indexes first and measure before introducing a separate search service.

Organizer flow:

1. Choose a store and branch for the group. Keep the chain/branch as IDs as well as a human-readable snapshot.
2. Search/browse grocery and household categories. Show image where permitted, product/brand, exact pack or price basis, acquisition estimate, last check, and availability/freshness state.
3. Select pack count and member share size. Sealed multipacks reuse the current unit/share model. Single sealed units are valid. Loose Bulk Barn products need weight/volume controls and explicit planned purchase quantity; do not pretend an open kilogram is a sealed multipack.
4. Add the item with a snapshot. Missing/stale prices require a confirmed acquisition estimate before publishing a payable quote. Known-price products without a retail comparison remain selectable; label savings honestly.
5. Show purchasing subtotal, estimated group service fee, organizer's $50 funding, expected formation minimum and member quote ceilings. Keep internal importer details out of the consumer flow.
6. Changing the branch after adding items triggers offer revalidation and repricing. The app cannot silently swap products/branches in an authorized group.

At authorization, revalidate acquisition estimates, source unit basis and active offers. At closure, freeze the chosen quantities/prices and cost-plus quote under the payment plan. Later catalogue updates do not mutate snapshots. Actual weighed purchases and store-price changes after closure use receipt reconciliation, refunds or explicit supplemental authorization; they do not permit overcapture or force an organizer to advance personal cash.

Preserve manual/custom items for missing or genuinely new products. They belong to the group and remain unverified globally until reviewed; they are not evidence that a full retailer import is complete. Preserve group-scoped suggestions and the existing no-quick-splits product scope.

## 7. Existing-code changes

- Replace the hard-coded `CATALOG` as the organizer's primary source with database-backed products/offers. Existing static entries may be mapped as legacy records; do not present their old prices as newly fetched.
- Extend `packages/contracts/src/index.ts` with retailer/location/product/offer IDs, exact quantity/price-basis contracts, freshness/availability and service-price quote fields. Keep raw acquisition cost separate from customer fee/total.
- Update `apps/mobile/src/components/ItemEditor.tsx` for debounced paginated search, store-scoped results, offer selection and fixed/weighted quantities. Avoid the current local-list limit becoming an accidental catalogue coverage limit.
- Update `apps/mobile/src/app/(tabs)/create.tsx` and relevant order screens to use retailer/location IDs, item snapshots and the cost-plus preview. Preserve existing draft behavior and deep links.
- Add catalogue routes/adapters/jobs to the current Node API and migrations under `db/migrations`; extend `order-model.ts`, claims and fulfillment only as required for quantities, snapshots and validation. Do not keep SQL transactions open across retailer/provider calls.
- Existing groups with free-text store names or legacy `catalogKey` remain readable and editable where currently permitted. Do not guess a historical branch or rewrite historical prices. New catalogue-linked groups use explicit locations.

## 8. Sequential implementation phases

| Phase | Deliverable | Acceptance criterion |
| --- | --- | --- |
| 0 — Source and scope validation | Four capability records, permitted access samples, country/location definitions, full-count/enumeration strategy and capacity/cost estimate | No unsupported promise of a full feed; source gaps and dependencies explicit for each retailer |
| 1 — Database and store selection | Migrations, retailer/branch registry, staging/observation model and compatible order snapshots | Four chains selectable; categories outside grocery/household stored but not orderable; legacy orders preserved |
| 2 — Complete source backfills | Costco, Wholesale Club, Bulk Barn and Walmart adapters, executed one retailer at a time with reusable ingestion infrastructure | Each retailer's requested source scope imported and reconciled; coverage reported without calling partial data complete |
| 3 — Organizer catalogue picker | Paginated search, branch filters, exact pack/weight quantities, freshness, manual fallback and drafts | Organizers can add eligible fixed-pack and weighted products from each chain; no full client-side catalogue download |
| 4 — Pricing and payment bridge | Cost-plus fee calculator, formation minimum, quote ceilings, comparison labels and immutable authorization/close snapshots | No fixed 20% or reference-driven price; $50 funded once; honest savings; no unauthorized price increase or early capture |
| 5 — Refresh and operational recovery | Delta/full refresh jobs, targeted rechecks, quarantine/review, alerts and source/cost dashboards | Outages/retries preserve good data and do not affect authorized orders or starve payment jobs |
| 6 — End-to-end and full-coverage release | Web/iOS/Android organizer flows, source-count reconciliation and real branch/receipt spot checks | All four full-source imports and order flows pass; unresolved physical-assortment gaps remain declared |

A small initial batch is a development checkpoint, not completion of phase 2. If a retailer cannot provide full source access, its database/UI work may proceed, but the requested complete import remains pending that dependency. Report the exact missing access rather than substituting a hand-entered sample and declaring success.

## 9. Validation and completion evidence

- Repeated imports produce no duplicate products/offers; checkpoint restart does not skip pages; a failed source page cannot retire valid products. Source totals reconcile to stored records and explicit quarantine/duplicate reasons.
- All source categories are retained. Grocery/household ordering rules do not accidentally delete non-orderable metadata. Unknown category is reviewed rather than silently treated as eligible.
- Exact SKU/GTIN, brand, flavour, net weight and case count remain distinct. Test per-100-g versus per-kg, grams versus kilograms, millilitres versus litres, multi-unit cases, deposits, member promotions and zero/missing prices.
- A national online product is not shown as confirmed local stock; a delivery price never overwrites a warehouse offer. Third-party marketplace seller offers cannot become local first-party offers.
- An organizer selects an item, saves a draft, reopens it, authorizes members and closes the group while source prices change. The selected snapshots and monetary ceilings remain intact. Weighted goods reconcile without silent extra captures.
- Search returns correct retailer/branch/category pages without duplicates or skipped cursors at measured representative full-catalogue scale. Record query plans, latency and database/source costs; do not make a performance claim from a tiny seed.
- The cost-plus example for five $100 baskets captures $587.68 under the stated rate/budget assumptions and pays $550 once. Unequal subtotals allocate shared costs by purchasing value, regardless of different retail references. New members can reduce fees; missing comparisons never produce invented savings.
- Missing source access, unknown authoritative count, partial branch coverage, unavailable price, inferred comparison and actual unavailability are different states in the completion report. “Fully imported” requires evidence for the stated source scope and a refresh process, not just a large row count.

Final implementation handoff should list retailer/source/branch coverage, source count, stored count, quarantined count, last successful full/delta sync, known gaps, tests and measured running cost. This plan itself imports nothing and provisions no paid services.
