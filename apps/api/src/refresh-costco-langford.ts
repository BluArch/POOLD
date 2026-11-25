import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { database, execute, rows, transaction } from "./db.js";
import {
  costcoProductId,
  scrapeCostcoLangford,
} from "./scrape-costco-langford.js";

const langfordReferenceOffers = `
  FROM store_offers o
  JOIN catalogue_products p ON p.id=o.product_id AND p.source_id=o.source_id
  JOIN catalogue_sources s ON s.id=o.source_id
  JOIN store_locations l ON l.id=o.location_id
  WHERE s.retailer_id='costco' AND s.name='Costco.ca shelf-stable price reference'
    AND s.access_method='costco-online-reference' AND l.retailer_id='costco'
    AND l.source_id='256' AND l.channel='warehouse' AND l.active
    AND p.active AND o.active AND o.seller_key='first-party'
    AND o.currency='CAD' AND o.price_basis='pack'`;

const snapshotSchema = z.strictObject({
  source: z.literal("costco.ca"),
  warehouseId: z.literal("256"),
  currency: z.literal("CAD"),
  observedAt: z.iso.datetime({ offset: true }),
  items: z
    .array(
      z
        .strictObject({
          itemNumber: z.string().regex(/^\d{1,20}$/),
          onlinePackPriceCents: z.number().int().min(1).max(1000000).optional(),
          warehouseStock: z
            .enum(["available", "unavailable", "unknown"])
            .optional(),
        })
        .refine(
          (item) =>
            item.onlinePackPriceCents !== undefined ||
            item.warehouseStock !== undefined,
        ),
    )
    .min(1)
    .max(10000),
});

async function downloadLangfordSnapshot(url: string, token?: string) {
  const endpoint = URL.parse(url);
  if (
    !endpoint ||
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password
  )
    throw new Error(
      "The Costco export URL must use HTTPS without embedded credentials.",
    );

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => {
    throw new Error("Could not download the Costco Langford export.");
  });
  if (!response.ok)
    throw new Error(`Costco export returned HTTP ${response.status}.`);
  if (!response.body) throw new Error("The Costco export response was empty.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let json = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024)
        throw new Error("The Costco export exceeded 2 MiB.");
      json += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(json + decoder.decode()) as unknown;
  } catch {
    throw new Error("The Costco export did not contain valid JSON.");
  }
}

export async function refreshCostcoLangford(db: Pool, input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  const observedAt = new Date(snapshot.observedAt);
  const age = Date.now() - observedAt.getTime();
  if (age > 26 * 60 * 60 * 1000 || age < -5 * 60 * 1000)
    throw new Error(
      "The Costco export observation time is outside the refresh window.",
    );
  const itemsByNumber = new Map(
    snapshot.items.map((item) => [item.itemNumber, item]),
  );
  if (itemsByNumber.size !== snapshot.items.length)
    throw new Error("The Costco export contains duplicate item numbers.");

  return transaction(db, async (connection) => {
    const offers = await rows(
      connection,
      `
      SELECT o.id, p.source_product_id, o.price_cents, o.observed_at,
        o.availability, o.stock_observed_at
      ${langfordReferenceOffers}
      FOR UPDATE`,
    );
    let matched = 0;
    let pricesRefreshed = 0;
    let stockRefreshed = 0;
    for (const offer of offers) {
      const item = itemsByNumber.get(offer.source_product_id);
      if (!item) continue;
      matched++;

      const price = item.onlinePackPriceCents;
      const priorPriceAt = offer.observed_at?.getTime() ?? -Infinity;
      if (
        price !== undefined &&
        observedAt.getTime() === priorPriceAt &&
        price !== offer.price_cents
      )
        throw new Error(
          `Conflicting Costco price for item ${item.itemNumber} at one observation time.`,
        );
      if (price !== undefined && observedAt.getTime() > priorPriceAt) {
        if (price !== offer.price_cents) {
          await execute(
            connection,
            `
            INSERT INTO price_observations(id,offer_id,price_cents,currency,price_basis,
              tax_included,deposit_cents,observed_at,source_at)
            VALUES(?,?,?,'CAD','pack',FALSE,0,?,?)`,
            [randomUUID(), offer.id, price, observedAt, observedAt],
          );
        }
        await execute(
          connection,
          `
          UPDATE store_offers SET price_cents=?,observed_at=?,promotion_ends_at=NULL,
            tax_included=FALSE,deposit_cents=0 WHERE id=?`,
          [price, observedAt, offer.id],
        );
        pricesRefreshed++;
      }

      const stock = item.warehouseStock;
      const priorStockAt = offer.stock_observed_at?.getTime() ?? -Infinity;
      if (
        stock !== undefined &&
        observedAt.getTime() === priorStockAt &&
        stock !== offer.availability
      )
        throw new Error(
          `Conflicting Langford stock for item ${item.itemNumber} at one observation time.`,
        );
      if (stock !== undefined && observedAt.getTime() > priorStockAt) {
        await execute(
          connection,
          `
          UPDATE store_offers SET availability=?,stock_observed_at=? WHERE id=?`,
          [stock, observedAt, offer.id],
        );
        stockRefreshed++;
      }
    }
    if (!matched)
      throw new Error(
        "The Costco export matched no existing Langford catalogue items.",
      );
    return {
      received: snapshot.items.length,
      matched,
      pricesRefreshed,
      stockRefreshed,
    };
  });
}

async function loadCostcoProductIds(db: Pool) {
  const offers = await rows(
    db,
    `
    SELECT p.source_product_id, (
      SELECT po.evidence FROM price_observations po
      WHERE po.offer_id=o.id AND po.evidence LIKE 'https://www.costco.ca/p/-%'
      ORDER BY po.observed_at DESC LIMIT 1
    ) AS product_link
    ${langfordReferenceOffers}`,
  );
  const productIds = new Map<string, string>();
  for (const offer of offers) {
    const productId = costcoProductId(offer.product_link);
    if (!productId) continue;
    if (
      productIds.has(productId) &&
      productIds.get(productId) !== offer.source_product_id
    )
      throw new Error(
        `Costco product ID ${productId} maps to more than one item number.`,
      );
    productIds.set(productId, offer.source_product_id);
  }
  if (!productIds.size)
    throw new Error(
      "No active Langford references have a Costco product link.",
    );
  console.log(
    `Found ${productIds.size} Costco links for ${offers.length} active Langford references.`,
  );
  return productIds;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.COSTCO_LANGFORD_EXPORT_URL;
  const db = database();
  try {
    const input = url
      ? await downloadLangfordSnapshot(
          url,
          process.env.COSTCO_LANGFORD_EXPORT_TOKEN,
        )
      : await scrapeCostcoLangford(await loadCostcoProductIds(db));
    if (process.argv.includes("--check")) {
      const sample = snapshotSchema.parse(input).items;
      console.log("Costco Langford dry run completed", {
        matched: sample.length,
        prices: sample.filter((item) => item.onlinePackPriceCents !== undefined)
          .length,
        inStock: sample.filter((item) => item.warehouseStock === "available")
          .length,
        outOfStock: sample.filter(
          (item) => item.warehouseStock === "unavailable",
        ).length,
      });
    } else {
      console.log(
        "Costco Langford refresh completed",
        await refreshCostcoLangford(db, input),
      );
    }
  } finally {
    await db.end();
  }
}
