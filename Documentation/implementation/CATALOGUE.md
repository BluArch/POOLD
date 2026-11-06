# Catalogue implementation and source gaps

November 5, 2026. The API has retailer and Greater Victoria branch records, product and offer tables, immutable price observations, a bounded branch search endpoint, and a local authorized-export importer. Organizers can choose a branch, search orderable offers, select fixed or exact gram/millilitre shares, and save a price/pack snapshot. Manual items and old drafts remain supported. There are **no retailer product imports in this repository** and no claim of complete branch assortment or live stock.

## Class-project demo catalogue

The committed demo seed generates 248 products and 520 branch offers in a local development database: 56 products each for Costco, Wholesale Club, and Walmart, plus 80 for Bulk Barn (including 24 weighted bulk foods). These names and prices are illustrative; they were not copied from retailer product feeds or observed at branches. The API, item picker, order cards, and share cards mark them as **class-project demo estimates**. No verified savings comparison is inferred. Demo offers have unknown stock and remain usable after their fixed fixture date because they are explicitly synthetic. They do not count as a successful full retailer sync.

A fresh clone or deployment has no branch products until explicitly populated. Run `npm run db:migrate` to apply catalogue migrations 013–016, then run the local-only, repeatable seed with `npm run catalogue:seed-demo -w @poold/api`. It refuses production and non-local database hosts. `npm run catalogue:status -w @poold/api` reports products, offers, and source coverage. Repeating the seed leaves product, offer, and observation counts unchanged.

## Verified branch registry

Locations were checked against the retailer pages on November 5, 2026. The registry records source IDs where they were visible. Wholesale Club's Viewfield address was corroborated by a [Loblaw listing](https://careers.loblaw.ca/cashier-part-time-day/job/PAF-LCL-A2011730-3BA3-48D8-9A4B-4A37F9266719_7647_1791217340_0); its branch source ID remains unknown.

| Retailer | Registered branches | Location evidence |
| --- | --- | --- |
| Costco | Langford warehouse, source ID 256 | [Costco warehouse page](https://www.costco.ca/w/-/bc/warehouse/256) |
| Wholesale Club | 846 Viewfield Rd | [Loblaw location](https://careers.loblaw.ca/cashier-part-time-day/job/PAF-LCL-A2011730-3BA3-48D8-9A4B-4A37F9266719_7647_1791217340_0) |
| Bulk Barn | Kelly Rd #661, Yates St #672, Shelbourne St #773 | [Bulk Barn selector](https://www.bulkbarn.ca/store_selector/en/) |
| Walmart | Victoria #3109, Hillside #1214, Langford #3188 | [Walmart 3109](https://www.walmart.ca/en/store/3109), [1214](https://www.walmart.ca/en/store/1214), [3188](https://www.walmart.ca/en/store/3188) |

These are branch identities and addresses, not evidence of product availability or local prices.

## Importing an authorized export

The importer takes a manifest JSON file and a newline-delimited JSON product file. It does not fetch, scrape, or license a retailer feed. Run migrations first, then:

```sh
npm run catalogue:import -w @poold/api -- /absolute/path/manifest.json /absolute/path/products.jsonl
npm run catalogue:status -w @poold/api
```

The manifest fields are `retailerId`, `sourceName`, `channel`, `accessMethod`, `coverageNote`, `rightsNote`, `confirmedStorageRights`, `retainSourceData`, `retainImageReferences`, `scope`, `full`, `expectedCount`, and `categoryMapping`. A full import requires a positive, authoritative `expectedCount`; partial imports use `full: false` and do not retire missing products. `categoryMapping` maps each exact source category to a supported grocery/household category or `null`. Unmapped and explicitly out-of-scope categories remain in the database but cannot be ordered.

Each JSONL row needs `sourceProductId`, `name`, `sourceCategory`, optional GTIN/brand/pack fields, and `offers`. An offer needs a registered `locationId`, `sourceOfferId`, `priceBasis`, `priceCents` (or null), and `observedAt` (or null). It may include seller, tax/deposit, availability, promotion, and evidence fields. For a priced offer, `observedAt` is required. Mark `taxIncluded: true` only when `priceCents` is the final tax-inclusive store acquisition amount, including cases with zero applicable tax. Deposits remain separate and are not orderable until their total is resolved. `100g`, `kg`, `100ml`, and `litre` observations convert to exact planned pack quantities; the raw observation remains unchanged.

The importer validates every row and source ID, records quarantine reasons, checks the stated count, then promotes in one database transaction. A failed validation or promotion leaves the previous catalogue projection intact. Repeating the same file reuses product and offer identities and price observations. Only a reconciled `full` import can retire absent products. Large full imports need capacity and transaction-duration measurements before running in production. The importer does not prove that the manifest's count or storage rights are authoritative; the source owner must verify both.

## Remaining external dependencies

| Retailer | Missing source capability evidence |
| --- | --- |
| Costco | Authorized Canada warehouse catalogue and Langford offer feed, enumerable total, retention and image rights |
| Wholesale Club | Authorized full product and Viewfield offer export, branch source ID, case/each semantics, rights and count |
| Bulk Barn | Authorized full category/item export, per-weight branch prices, handling/pack rules, rights and count |
| Walmart | Authorized Canadian catalogue and local first-party offer source, marketplace separation, rights and count |

No complete authorized feed or representative sample for these four sources has been provided. Source capability records, full backfills, automatic refresh jobs, production capacity costing, physical assortment checks, and comparison-price coverage remain open. Price observations are estimates and stock may be unknown. The payment workflow still needs commercial, tax, provider, and funding validation before any live authorization or payout.
