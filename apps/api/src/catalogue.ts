import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { itemFromUnits, type ItemInput } from "@poold/contracts";
import type { DB } from "./db.js";
import { first, rows, iso } from "./db.js";
import { fail } from "./errors.js";

const pageQuery = z.object({
  retailerId: z.string().max(40),
  locationId: z.string().uuid(),
  category: z.string().max(40).optional(),
  query: z.string().trim().max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export function catalogue(db: Pool) {
  const r = Router();
  r.get("/retailers", async (_req, res) => {
    const data = await rows(
      db,
      `SELECT r.id,r.name,r.country,COUNT(l.id) AS location_count FROM retailers r
      LEFT JOIN store_locations l ON l.retailer_id=r.id AND l.active=TRUE
      WHERE r.active=TRUE GROUP BY r.id,r.name,r.country ORDER BY r.name`,
    );
    res.json(
      data.map((x) => ({
        id: x.id,
        name: x.name,
        country: x.country,
        locationCount: Number(x.location_count),
      })),
    );
  });
  r.get("/retailers/:id/locations", async (req, res) => {
    const data = await rows(
      db,
      `SELECT id,retailer_id,name,address,city,region,channel,verified_at
      FROM store_locations WHERE retailer_id=? AND active=TRUE ORDER BY city,name,id`,
      [req.params.id],
    );
    res.json(
      data.map((x) => ({
        id: x.id,
        retailerId: x.retailer_id,
        name: x.name,
        address: x.address,
        city: x.city,
        region: x.region,
        channel: x.channel,
        verifiedAt: x.verified_at ? iso(x.verified_at) : null,
      })),
    );
  });
  r.get("/catalogue/products", async (req, res) => {
    const q = pageQuery.parse(req.query);
    const location = await first(
      db,
      "SELECT id FROM store_locations WHERE id=? AND retailer_id=? AND active=TRUE",
      [q.locationId, q.retailerId],
    );
    if (!location)
      fail(
        404,
        "LOCATION_NOT_FOUND",
        "Choose an available branch for this store.",
      );
    const clauses = [
      "l.id=?",
      "s.retailer_id=?",
      "o.active=TRUE",
      "o.orderable=TRUE",
      "o.availability<>'unavailable'",
      "o.price_cents IS NOT NULL",
      "p.active=TRUE",
      "p.unit IS NOT NULL",
      "p.pack_units IS NOT NULL",
    ];
    const params: unknown[] = [q.locationId, q.retailerId];
    if (q.category) {
      clauses.push("p.category=?");
      params.push(q.category);
    }
    if (q.cursor) {
      clauses.push("o.id>?");
      params.push(q.cursor);
    }
    if (q.query) {
      const terms =
        q.query.match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length >= 3) ??
        [];
      if (terms.length) {
        clauses.push(
          "(MATCH(p.name,p.brand,p.source_category,p.source_product_id) AGAINST (? IN BOOLEAN MODE) OR p.gtin=? OR p.source_product_id=?)",
        );
        params.push(
          terms.map((word) => `+${word}*`).join(" "),
          q.query,
          q.query,
        );
      } else {
        clauses.push("(p.gtin=? OR p.source_product_id=?)");
        params.push(q.query, q.query);
      }
    }
    const data = await rows(
      db,
      `SELECT o.id AS offer_id,o.revision,o.price_cents,o.price_basis,o.availability,o.observed_at,
      p.id,p.name,p.brand,p.category,p.pack_label,p.unit,p.pack_units,p.unit_detail,s.retailer_id,s.access_method,l.id AS location_id
      FROM store_offers o JOIN catalogue_products p ON p.id=o.product_id JOIN catalogue_sources s ON s.id=p.source_id
      JOIN store_locations l ON l.id=o.location_id WHERE ${clauses.join(" AND ")} ORDER BY o.id LIMIT ?`,
      [...params, q.limit + 1],
    );
    const page = data.slice(0, q.limit);
    res.json({
      items: page.map((x) => ({
        id: x.id,
        offerId: x.offer_id,
        revision: Number(x.revision),
        retailerId: x.retailer_id,
        locationId: x.location_id,
        name: x.name,
        brand: x.brand,
        category: x.category,
        packLabel: x.pack_label,
        unit: x.unit,
        packUnits: x.pack_units,
        unitDetail: x.unit_detail,
        priceCents: packPrice(
          x.price_cents,
          x.price_basis,
          x.pack_units,
          x.unit,
        ),
        priceBasis: x.price_basis,
        availability: x.availability,
        observedAt: x.observed_at ? iso(x.observed_at) : null,
        priceSource: x.access_method === "synthetic-demo" ? "demo" : "retailer",
      })),
      nextCursor: data.length > q.limit ? page.at(-1)!.offer_id : null,
    });
  });
  r.get("/catalogue/products/:id", async (req, res) => {
    const p = await first(
      db,
      `SELECT p.id,p.name,p.brand,p.source_category,p.category,p.orderability_reason,p.pack_label,p.unit,p.pack_units,p.unit_detail,p.active,s.retailer_id
      FROM catalogue_products p JOIN catalogue_sources s ON s.id=p.source_id WHERE p.id=?`,
      [req.params.id],
    );
    if (!p) fail(404, "NOT_FOUND", "Product not found.");
    res.json(p);
  });
  r.get("/catalogue/offers/:id", async (req, res) => {
    const o = await first(
      db,
      `SELECT o.*,p.name,p.category,p.pack_label,p.unit,p.pack_units,p.unit_detail,l.retailer_id
      FROM store_offers o JOIN catalogue_products p ON p.id=o.product_id JOIN store_locations l ON l.id=o.location_id WHERE o.id=?`,
      [req.params.id],
    );
    if (!o) fail(404, "NOT_FOUND", "Offer not found.");
    res.json({
      id: o.id,
      productId: o.product_id,
      locationId: o.location_id,
      retailerId: o.retailer_id,
      revision: Number(o.revision),
      priceCents: o.price_cents,
      priceBasis: o.price_basis,
      availability: o.availability,
      orderable: !!o.orderable,
      orderabilityReason: o.orderability_reason,
      observedAt: o.observed_at ? iso(o.observed_at) : null,
    });
  });
  return r;
}

function packPrice(
  price: number,
  basis: string,
  units: number,
  unit: string,
): number {
  if (basis === "pack" || basis === "each") return price;
  const denominator =
    basis === "100g" && unit === "g"
      ? 100
      : basis === "kg" && unit === "g"
        ? 1000
        : basis === "100ml" && unit === "mL"
          ? 100
          : basis === "litre" && unit === "mL"
            ? 1000
            : 1;
  return Math.round((price * units) / denominator);
}

export async function validateLocation(
  db: DB,
  retailerId: string | null,
  locationId: string | null,
) {
  if (!retailerId && !locationId) return null;
  const location = await first(
    db,
    `SELECT l.id,l.name AS location_name,r.name AS retailer_name FROM store_locations l
    JOIN retailers r ON r.id=l.retailer_id WHERE l.id=? AND l.retailer_id=? AND l.active=TRUE AND r.active=TRUE`,
    [locationId, retailerId],
  );
  if (!location)
    fail(
      400,
      "LOCATION_INVALID",
      "The selected branch is unavailable for this store.",
    );
  return `${location.retailer_name} · ${location.location_name}`;
}

export async function resolveItems(
  db: DB,
  items: ItemInput[],
  retailerId: string | null,
  locationId: string | null,
) {
  const resolved: (ItemInput & {
    catalogueProductId?: string | null;
    priceObservationId?: string | null;
    priceBasis?: string | null;
    priceSource?: "demo" | "retailer";
  })[] = [];
  for (const item of items) {
    if (!item.offerId) {
      resolved.push(item);
      continue;
    }
    if (!locationId || !retailerId || !item.offerRevision)
      fail(
        400,
        "OFFER_SCOPE",
        "Choose a branch and current offer before adding a catalogue item.",
      );
    const offer = await first(
      db,
      `SELECT o.*,p.name,p.category,p.pack_label,p.unit,p.pack_units,p.unit_detail,p.active AS product_active,
      s.retailer_id,s.access_method,l.active AS location_active FROM store_offers o
      JOIN catalogue_products p ON p.id=o.product_id JOIN catalogue_sources s ON s.id=p.source_id
      JOIN store_locations l ON l.id=o.location_id WHERE o.id=?`,
      [item.offerId],
    );
    if (
      !offer ||
      offer.location_id !== locationId ||
      offer.retailer_id !== retailerId ||
      !offer.active ||
      !offer.location_active ||
      !offer.product_active ||
      !offer.orderable ||
      offer.availability === "unavailable" ||
      !offer.tax_included ||
      offer.deposit_cents !== 0
    )
      fail(
        409,
        "OFFER_UNAVAILABLE",
        "This item is no longer available for the selected branch.",
      );
    if (
      offer.access_method !== "synthetic-demo" &&
      (!offer.observed_at ||
        Date.now() - new Date(offer.observed_at).getTime() >
          24 * 60 * 60 * 1000)
    )
      fail(
        409,
        "OFFER_STALE",
        "This branch price needs a fresh check. Enter a confirmed manual estimate if needed.",
      );
    if (
      Number(offer.revision) !== item.offerRevision ||
      packPrice(
        offer.price_cents,
        offer.price_basis,
        offer.pack_units,
        offer.unit,
      ) !== item.priceCents
    )
      fail(
        409,
        "OFFER_CHANGED",
        "This item’s price or details changed. Choose it again.",
      );
    if (!(
      offer.unit &&
      offer.pack_units &&
      offer.category &&
      (["pack", "each"].includes(offer.price_basis) ||
        (["100g", "kg"].includes(offer.price_basis) &&
          offer.unit === "g" &&
          offer.pack_units % 1000 === 0) ||
        (["100ml", "litre"].includes(offer.price_basis) &&
          offer.unit === "mL" &&
          offer.pack_units % 1000 === 0))
    ))
      fail(
        409,
        "OFFER_UNSUPPORTED",
        "This item needs a supported pack and price basis before it can be added.",
      );
    const snapshot = itemFromUnits({
      name: offer.name,
      category: offer.category,
      unit: offer.unit,
      packUnits: offer.pack_units,
      shareUnits: item.shareUnits ?? 1,
      unitDetail: offer.unit_detail ?? "",
      priceCents: item.priceCents,
      packCount: item.packCount,
      storage: item.storage,
      catalogKey: null,
    });
    if (snapshot.sharesPerPack !== item.sharesPerPack)
      fail(409, "OFFER_CHANGED", "Choose the share size again for this item.");
    const observation = await first(
      db,
      "SELECT id FROM price_observations WHERE offer_id=? ORDER BY observed_at DESC,id DESC LIMIT 1",
      [offer.id],
    );
    resolved.push({
      ...snapshot,
      offerId: offer.id,
      offerRevision: Number(offer.revision),
      catalogueProductId: offer.product_id,
      priceObservationId: observation?.id ?? null,
      priceBasis: offer.price_basis,
      priceSource:
        offer.access_method === "synthetic-demo" ? "demo" : "retailer",
    });
  }
  return resolved;
}

export async function validateLinkedOrderOffers(
  db: DB,
  orderId: string,
  purchaseAt: Date,
) {
  const linked = await rows(
    db,
    `SELECT i.offer_revision,o.revision,o.active,o.orderable,o.availability,o.observed_at,o.promotion_ends_at,
    p.active AS product_active,l.active AS location_active,s.access_method FROM order_items i
    LEFT JOIN store_offers o ON o.id=i.offer_id LEFT JOIN catalogue_products p ON p.id=o.product_id
    LEFT JOIN catalogue_sources s ON s.id=o.source_id
    LEFT JOIN store_locations l ON l.id=o.location_id WHERE i.order_id=? AND i.offer_id IS NOT NULL`,
    [orderId],
  );
  for (const x of linked) {
    if (
      !x.revision ||
      Number(x.offer_revision) !== Number(x.revision) ||
      !x.active ||
      !x.product_active ||
      !x.location_active ||
      !x.orderable ||
      x.availability === "unavailable"
    )
      fail(
        409,
        "OFFER_CHANGED",
        "A catalogue item changed. Edit the draft and choose it again.",
      );
    if (
      (x.access_method !== "synthetic-demo" &&
        (!x.observed_at ||
          Date.now() - new Date(x.observed_at).getTime() >
            24 * 60 * 60 * 1000)) ||
      (x.promotion_ends_at && new Date(x.promotion_ends_at) < purchaseAt)
    )
      fail(
        409,
        "OFFER_STALE",
        "A catalogue price needs a fresh check before this group can be published.",
      );
  }
}
