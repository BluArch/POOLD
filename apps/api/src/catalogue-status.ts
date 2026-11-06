import { fileURLToPath } from "node:url";
import { database, rows } from "./db.js";

export async function catalogueStatus(db: ReturnType<typeof database>) {
  const retailers = await rows(
    db,
    `SELECT r.id,r.name,
    (SELECT COUNT(*) FROM store_locations l WHERE l.retailer_id=r.id AND l.active=TRUE) AS branches,
    (SELECT COUNT(*) FROM catalogue_products p JOIN catalogue_sources s ON s.id=p.source_id WHERE s.retailer_id=r.id AND p.active=TRUE) AS products,
    (SELECT COUNT(*) FROM store_offers o JOIN catalogue_sources s ON s.id=o.source_id WHERE s.retailer_id=r.id AND o.active=TRUE AND o.orderable=TRUE) AS orderable_offers
    FROM retailers r ORDER BY r.name`,
  );
  const sources = await rows(
    db,
    `SELECT s.retailer_id,s.name,s.channel,s.access_method,s.coverage_note,s.authoritative_count,
    s.last_full_sync_at,s.last_delta_sync_at,
    (SELECT COUNT(*) FROM catalogue_sync_runs x WHERE x.source_id=s.id AND x.status='failed') AS failed_runs,
    (SELECT COALESCE(SUM(x.quarantined_count),0) FROM catalogue_sync_runs x WHERE x.source_id=s.id) AS quarantined
    FROM catalogue_sources s ORDER BY s.retailer_id,s.name`,
  );
  return retailers.map((r) => ({
    retailerId: r.id,
    retailer: r.name,
    branches: Number(r.branches),
    products: Number(r.products),
    orderableOffers: Number(r.orderable_offers),
    sources: sources
      .filter((s) => s.retailer_id === r.id)
      .map((s) => ({
        name: s.name,
        channel: s.channel,
        accessMethod: s.access_method,
        coverage: s.coverage_note,
        authoritativeCount:
          s.authoritative_count === null ? null : Number(s.authoritative_count),
        lastFullSync: s.last_full_sync_at
          ? new Date(s.last_full_sync_at).toISOString()
          : null,
        lastDeltaSync: s.last_delta_sync_at
          ? new Date(s.last_delta_sync_at).toISOString()
          : null,
        failedRuns: Number(s.failed_runs),
        quarantined: Number(s.quarantined),
      })),
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = database();
  try {
    console.log(JSON.stringify(await catalogueStatus(db), null, 2));
  } finally {
    await db.end();
  }
}
