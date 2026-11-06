/** Imports a locally supplied, authorized JSONL export. This does not fetch retailer data. */
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CATEGORIES } from "@poold/contracts";
import { database, execute, first, rows, type DB } from "./db.js";

const manifestSchema = z
  .object({
    retailerId: z.enum(["costco", "wholesale-club", "bulk-barn", "walmart"]),
    sourceName: z.string().min(1).max(120),
    channel: z.string().min(1).max(40),
    accessMethod: z.string().min(1).max(80),
    coverageNote: z.string().min(1),
    rightsNote: z.string().min(1),
    confirmedStorageRights: z.literal(true),
    retainSourceData: z.boolean().default(false),
    retainImageReferences: z.boolean().default(false),
    scope: z.string().min(1).max(240),
    full: z.boolean(),
    expectedCount: z.number().int().nonnegative().nullable(),
    categoryMapping: z.record(z.string(), z.enum(CATEGORIES).nullable()),
  })
  .superRefine((m, ctx) => {
    if (m.full && (!m.expectedCount || m.expectedCount < 1))
      ctx.addIssue({
        code: "custom",
        message: "A full import needs a positive authoritative product count.",
      });
  });
const offerSchema = z
  .object({
    locationId: z.string().uuid(),
    sourceOfferId: z.string().min(1).max(160),
    sellerKey: z.string().min(1).max(120).default("first-party"),
    priceBasis: z.enum(["pack", "each", "100g", "kg", "100ml", "litre"]),
    priceCents: z.number().int().min(1).max(100000000).nullable(),
    taxIncluded: z.boolean().default(false),
    depositCents: z.number().int().min(0).max(100000000).default(0),
    availability: z
      .enum(["unknown", "available", "unavailable"])
      .default("unknown"),
    observedAt: z.iso.datetime({ offset: true }).nullable(),
    promotionEndsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    evidence: z.string().max(1000).nullable().default(null),
  })
  .superRefine((o, ctx) => {
    if (o.priceCents !== null && o.observedAt === null)
      ctx.addIssue({
        code: "custom",
        message: "A price requires an observation timestamp.",
      });
  });
const productSchema = z.object({
  sourceProductId: z.string().min(1).max(160),
  gtin: z.string().max(32).nullable().default(null),
  brand: z.string().max(120).nullable().default(null),
  name: z.string().min(1).max(200),
  sourceCategory: z.string().min(1).max(160),
  imageUrl: z.url().max(1000).nullable().default(null),
  packLabel: z.string().max(120).nullable().default(null),
  unit: z.string().max(30).nullable().default(null),
  packUnits: z.number().int().min(1).max(100000).nullable().default(null),
  unitDetail: z.string().max(120).nullable().default(null),
  offers: z.array(offerSchema).default([]),
});
type Manifest = z.infer<typeof manifestSchema>;
type Product = z.infer<typeof productSchema>;

async function* records(path: string) {
  const input = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of input) if (line.trim()) yield line;
  } finally {
    input.close();
  }
}
function eligibility(
  p: Product,
  category: string | null,
  o: Product["offers"][number],
  channel: string,
) {
  if (!category)
    return "Category needs review or is outside grocery and household.";
  if (!p.unit || !p.packUnits || !p.packLabel)
    return "Pack or quantity structure is missing.";
  if (p.name.length > 100 || p.packUnits > 10000)
    return "Product exceeds supported order-item limits.";
  if (["pack", "each"].includes(o.priceBasis) && p.packUnits > 1000)
    return "Pack has more than 1,000 sealed units.";
  if (o.sellerKey !== "first-party")
    return "Third-party seller is not a local shopping offer.";
  if (!["store", "warehouse", "pickup"].includes(channel))
    return "Channel is not a local shopping run.";
  if (o.priceCents === null) return "Branch price is missing.";
  if (!o.taxIncluded)
    return "Final tax-inclusive acquisition price is not verified.";
  if (o.depositCents) return "Deposit total needs review before ordering.";
  const denominator =
    o.priceBasis === "100g" || o.priceBasis === "100ml"
      ? 100
      : o.priceBasis === "kg" || o.priceBasis === "litre"
        ? 1000
        : 1;
  const packPrice = ["pack", "each"].includes(o.priceBasis)
    ? o.priceCents
    : Math.round((o.priceCents * p.packUnits) / denominator);
  if (packPrice > 1000000) return "Pack estimate exceeds supported item price.";
  if (
    ["100g", "kg"].includes(o.priceBasis) &&
    !(p.unit === "g" && p.packUnits % 1000 === 0)
  )
    return "Weight basis needs an exact gram quantity.";
  if (
    ["100ml", "litre"].includes(o.priceBasis) &&
    !(p.unit === "mL" && p.packUnits % 1000 === 0)
  )
    return "Volume basis needs an exact millilitre quantity.";
  return null;
}
async function promoteProduct(
  db: DB,
  sourceId: string,
  m: Manifest,
  p: Product,
) {
  const category = Object.prototype.hasOwnProperty.call(
    m.categoryMapping,
    p.sourceCategory,
  )
    ? m.categoryMapping[p.sourceCategory]
    : null;
  const reason = category
    ? !p.unit || !p.packUnits || !p.packLabel
      ? "Pack or quantity structure is missing."
      : null
    : "Category needs review or is outside grocery and household.";
  await execute(
    db,
    `INSERT INTO catalogue_products(id,source_id,source_product_id,gtin,brand,name,source_category,category,orderability_reason,image_url,
    pack_label,unit,pack_units,unit_detail,source_data,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE)
    ON DUPLICATE KEY UPDATE gtin=VALUES(gtin),brand=VALUES(brand),name=VALUES(name),source_category=VALUES(source_category),
    category=VALUES(category),orderability_reason=VALUES(orderability_reason),image_url=VALUES(image_url),pack_label=VALUES(pack_label),
    unit=VALUES(unit),pack_units=VALUES(pack_units),unit_detail=VALUES(unit_detail),source_data=VALUES(source_data),active=TRUE,updated_at=UTC_TIMESTAMP(3)`,
    [
      randomUUID(),
      sourceId,
      p.sourceProductId,
      p.gtin,
      p.brand,
      p.name,
      p.sourceCategory,
      category,
      reason,
      m.retainImageReferences ? p.imageUrl : null,
      p.packLabel,
      p.unit,
      p.packUnits,
      p.unitDetail,
      m.retainSourceData ? JSON.stringify(p) : null,
    ],
  );
  const product = await first(
    db,
    "SELECT id FROM catalogue_products WHERE source_id=? AND source_product_id=?",
    [sourceId, p.sourceProductId],
  );
  for (const o of p.offers) {
    const location = await first(
      db,
      "SELECT retailer_id,channel,active FROM store_locations WHERE id=?",
      [o.locationId],
    );
    if (
      !location ||
      location.retailer_id !== m.retailerId ||
      !location.active ||
      location.channel !== m.channel
    )
      throw new Error(
        `${p.sourceProductId}: offer refers to an unregistered branch or mismatched retailer/channel.`,
      );
    const reason = eligibility(p, category, o, location.channel);
    const prior = await first(
      db,
      "SELECT * FROM store_offers WHERE source_id=? AND location_id=? AND seller_key=? AND source_offer_id=?",
      [sourceId, o.locationId, o.sellerKey, o.sourceOfferId],
    );
    if (prior && prior.product_id !== product.id)
      throw new Error(
        `${p.sourceProductId}: source offer identity changed product.`,
      );
    const observed = o.observedAt ? new Date(o.observedAt) : null;
    if (
      prior?.observed_at &&
      observed &&
      new Date(prior.observed_at).getTime() > observed.getTime()
    )
      continue;
    if (
      prior?.observed_at &&
      observed &&
      new Date(prior.observed_at).getTime() === observed.getTime() &&
      prior.price_cents !== o.priceCents
    )
      throw new Error(
        `${p.sourceProductId}: conflicting price at one source timestamp.`,
      );
    const changed =
      !prior ||
      prior.price_cents !== o.priceCents ||
      prior.price_basis !== o.priceBasis ||
      prior.availability !== o.availability ||
      !!prior.orderable !== !reason ||
      prior.orderability_reason !== reason ||
      prior.tax_included !== Number(o.taxIncluded) ||
      prior.deposit_cents !== o.depositCents ||
      !prior.active;
    const offerId = prior?.id ?? randomUUID();
    if (!prior)
      await execute(
        db,
        `INSERT INTO store_offers(id,source_id,product_id,location_id,seller_key,source_offer_id,price_basis,price_cents,tax_included,
        deposit_cents,availability,orderable,orderability_reason,observed_at,promotion_ends_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          offerId,
          sourceId,
          product.id,
          o.locationId,
          o.sellerKey,
          o.sourceOfferId,
          o.priceBasis,
          o.priceCents,
          o.taxIncluded,
          o.depositCents,
          o.availability,
          !reason,
          reason,
          observed,
          o.promotionEndsAt ? new Date(o.promotionEndsAt) : null,
        ],
      );
    else if (changed)
      await execute(
        db,
        `UPDATE store_offers SET price_basis=?,price_cents=?,tax_included=?,deposit_cents=?,availability=?,orderable=?,
        orderability_reason=?,observed_at=?,promotion_ends_at=?,active=TRUE,revision=revision+1 WHERE id=?`,
        [
          o.priceBasis,
          o.priceCents,
          o.taxIncluded,
          o.depositCents,
          o.availability,
          !reason,
          reason,
          observed,
          o.promotionEndsAt ? new Date(o.promotionEndsAt) : null,
          offerId,
        ],
      );
    else if (
      observed &&
      (!prior.observed_at ||
        new Date(prior.observed_at).getTime() < observed.getTime())
    )
      await execute(
        db,
        "UPDATE store_offers SET observed_at=?,promotion_ends_at=? WHERE id=?",
        [
          observed,
          o.promotionEndsAt ? new Date(o.promotionEndsAt) : null,
          offerId,
        ],
      );
    if (o.priceCents !== null && observed) {
      const existing = await first(
        db,
        "SELECT id FROM price_observations WHERE offer_id=? AND observed_at=? AND price_cents=?",
        [offerId, observed, o.priceCents],
      );
      if (!existing)
        await execute(
          db,
          `INSERT INTO price_observations(id,offer_id,price_cents,currency,price_basis,tax_included,deposit_cents,observed_at,source_at,promotion_ends_at,evidence)
        VALUES(?,? ,?,'CAD',?,?,?,?,?,?,?)`,
          [
            randomUUID(),
            offerId,
            o.priceCents,
            o.priceBasis,
            o.taxIncluded,
            o.depositCents,
            observed,
            observed,
            o.promotionEndsAt ? new Date(o.promotionEndsAt) : null,
            o.evidence,
          ],
        );
    }
  }
}

export async function importCatalogue(
  db: ReturnType<typeof database>,
  manifestPath: string,
  recordsPath: string,
) {
  const m = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  const lease = await db.getConnection();
  const lockName = `poold_catalogue_${createHash("sha256").update(`${m.retailerId}:${m.sourceName}`).digest("hex").slice(0, 32)}`;
  try {
    const lock = await first(lease, "SELECT GET_LOCK(?,10) AS acquired", [
      lockName,
    ]);
    if (!lock?.acquired)
      throw new Error("Another import for this source is still running.");
    const source = await first(
      lease,
      "SELECT id FROM catalogue_sources WHERE retailer_id=? AND name=?",
      [m.retailerId, m.sourceName],
    );
    const sourceId = source?.id ?? randomUUID(),
      runId = randomUUID();
    if (!source)
      await execute(
        lease,
        `INSERT INTO catalogue_sources(id,retailer_id,name,channel,access_method,coverage_note,rights_note,authoritative_count)
    VALUES(?,?,?,?,?,?,?,?)`,
        [
          sourceId,
          m.retailerId,
          m.sourceName,
          m.channel,
          m.accessMethod,
          m.coverageNote,
          m.rightsNote,
          m.expectedCount,
        ],
      );
    await execute(
      lease,
      "INSERT INTO catalogue_sync_runs(id,source_id,scope,expected_count) VALUES(?,?,?,?)",
      [runId, sourceId, m.scope, m.expectedCount],
    );
    const seen = new Set<string>();
    let count = 0,
      quarantined = 0;
    const hash = createHash("sha256");
    try {
      for await (const line of records(recordsPath)) {
        count++;
        hash.update(line + "\n");
        try {
          const p = productSchema.parse(JSON.parse(line));
          if (seen.has(p.sourceProductId))
            throw new Error("Duplicate source product ID in export.");
          seen.add(p.sourceProductId);
        } catch (e) {
          quarantined++;
          await execute(
            lease,
            "INSERT INTO catalogue_import_errors(id,run_id,reason,source_data) VALUES(?,?,?,?)",
            [
              randomUUID(),
              runId,
              `${count}: ${e instanceof Error ? e.message : String(e)}`.slice(
                0,
                500,
              ),
              null,
            ],
          );
        }
        if (count % 100 === 0)
          await execute(
            lease,
            "UPDATE catalogue_sync_runs SET cursor_value=?,received_count=?,accepted_count=?,quarantined_count=? WHERE id=?",
            [String(count), count, seen.size, quarantined, runId],
          );
      }
      if (
        quarantined ||
        (m.expectedCount !== null && m.expectedCount !== count)
      )
        throw new Error(
          `Import not promoted: ${count} rows, ${quarantined} quarantined, expected ${m.expectedCount ?? "unknown"}.`,
        );
      const fingerprint = hash.digest("hex");
      await lease.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await lease.beginTransaction();
      try {
        const c = lease;
        const verify = createHash("sha256");
        for await (const line of records(recordsPath)) {
          verify.update(line + "\n");
          await promoteProduct(
            c,
            sourceId,
            m,
            productSchema.parse(JSON.parse(line)),
          );
        }
        if (verify.digest("hex") !== fingerprint)
          throw new Error("Export changed between validation and promotion.");
        if (m.full) {
          const old = await rows(
            c,
            "SELECT id,source_product_id FROM catalogue_products WHERE source_id=? AND active=TRUE",
            [sourceId],
          );
          for (const p of old)
            if (!seen.has(p.source_product_id)) {
              await execute(
                c,
                "UPDATE catalogue_products SET active=FALSE WHERE id=?",
                [p.id],
              );
              await execute(
                c,
                "UPDATE store_offers SET active=FALSE,orderable=FALSE,orderability_reason='Removed from authoritative source' WHERE product_id=?",
                [p.id],
              );
            }
        }
        await execute(
          c,
          `UPDATE catalogue_sources SET channel=?,access_method=?,coverage_note=?,rights_note=?,authoritative_count=?,
        ${m.full ? "last_full_sync_at" : "last_delta_sync_at"}=UTC_TIMESTAMP(3) WHERE id=?`,
          [
            m.channel,
            m.accessMethod,
            m.coverageNote,
            m.rightsNote,
            m.expectedCount,
            sourceId,
          ],
        );
        await execute(
          c,
          "UPDATE catalogue_sync_runs SET status='completed',cursor_value=?,received_count=?,accepted_count=?,quarantined_count=0,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
          [String(count), count, count, runId],
        );
        await lease.commit();
      } catch (e) {
        await lease.rollback();
        throw e;
      }
      return {
        runId,
        sourceId,
        scope: m.scope,
        full: m.full,
        received: count,
        accepted: count,
      };
    } catch (e) {
      await execute(
        lease,
        "UPDATE catalogue_sync_runs SET status='failed',cursor_value=?,received_count=?,accepted_count=?,quarantined_count=?,error_text=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [
          String(count),
          count,
          seen.size,
          quarantined,
          e instanceof Error ? e.message : String(e),
          runId,
        ],
      );
      throw e;
    }
  } finally {
    try {
      await first(lease, "SELECT RELEASE_LOCK(?) AS released", [lockName]);
    } finally {
      lease.release();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [manifest, sourceFile] = process.argv.slice(2);
  if (!manifest || !sourceFile)
    throw new Error(
      "Usage: npm run catalogue:import -w @poold/api -- manifest.json records.jsonl",
    );
  const db = database();
  try {
    console.log(await importCatalogue(db, manifest, sourceFile));
  } finally {
    await db.end();
  }
}
