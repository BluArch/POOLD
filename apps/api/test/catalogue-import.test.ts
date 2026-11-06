import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database, first, rows, execute } from "../src/db.js";
import { importCatalogue } from "../src/import-catalogue.js";
import { setup } from "./helpers.js";

test("authorized full export retains all categories, is idempotent and fails closed on count mismatch", async () => {
  const s = await setup(),
    folder = await mkdtemp(join(tmpdir(), "poold-catalogue-"));
  const sourceName = `fixture-${randomUUID()}`;
  const manifest = join(folder, "manifest.json"),
    file = join(folder, "records.jsonl");
  const branch = "00000000-0000-4000-8000-000000000256";
  const now = new Date().toISOString();
  const rowsIn = [
    {
      sourceProductId: "FOOD-1",
      name: "Fixture rice",
      sourceCategory: "Rice",
      packLabel: "1 bag",
      unit: "bag",
      packUnits: 1,
      offers: [
        {
          locationId: branch,
          sourceOfferId: "FOOD-1",
          priceBasis: "pack",
          priceCents: 1099,
          taxIncluded: true,
          observedAt: now,
        },
      ],
    },
    {
      sourceProductId: "TV-1",
      name: "Fixture television",
      sourceCategory: "Electronics",
      packLabel: "1 box",
      unit: "box",
      packUnits: 1,
      offers: [
        {
          locationId: branch,
          sourceOfferId: "TV-1",
          priceBasis: "pack",
          priceCents: 90000,
          taxIncluded: true,
          observedAt: now,
        },
      ],
    },
    {
      sourceProductId: "NUT-1",
      name: "Fixture almonds",
      sourceCategory: "Nuts",
      packLabel: "1000 g",
      unit: "g",
      packUnits: 1000,
      offers: [
        {
          locationId: branch,
          sourceOfferId: "NUT-1",
          priceBasis: "100g",
          priceCents: 149,
          taxIncluded: true,
          observedAt: now,
        },
      ],
    },
  ];
  const config = {
    retailerId: "costco",
    sourceName,
    channel: "warehouse",
    accessMethod: "authorized fixture",
    coverageNote: "three test records",
    rightsNote: "test data only",
    confirmedStorageRights: true,
    retainSourceData: false,
    scope: "fixture full",
    full: true,
    expectedCount: 3,
    categoryMapping: { Rice: "Pantry", Electronics: null, Nuts: "Pantry" },
  };
  try {
    await writeFile(manifest, JSON.stringify(config));
    await writeFile(
      file,
      rowsIn.map((x) => JSON.stringify(x)).join("\n") + "\n",
    );
    await importCatalogue(s.db, manifest, file);
    await importCatalogue(s.db, manifest, file);
    const source = await first(
      s.db,
      "SELECT id FROM catalogue_sources WHERE retailer_id='costco' AND name=?",
      [sourceName],
    );
    const products = await rows(
      s.db,
      "SELECT source_product_id,category,active FROM catalogue_products WHERE source_id=? ORDER BY source_product_id",
      [source.id],
    );
    assert.deepEqual(
      products.map((x) => [x.source_product_id, x.category, !!x.active]),
      [
        ["FOOD-1", "Pantry", true],
        ["NUT-1", "Pantry", true],
        ["TV-1", null, true],
      ],
    );
    const available = await s.call(
      `/catalogue/products?retailerId=costco&locationId=${branch}&query=Fixture`,
    );
    assert.equal(available.status, 200);
    assert.ok(available.body.items.some((x: any) => x.name === "Fixture rice"));
    assert.equal(
      available.body.items.find((x: any) => x.name === "Fixture almonds")
        ?.priceCents,
      1490,
    );
    assert.ok(
      !available.body.items.some((x: any) => x.name === "Fixture television"),
    );
    const observationCount = await first(
      s.db,
      `SELECT COUNT(*) AS n FROM price_observations po JOIN store_offers o ON o.id=po.offer_id
      JOIN catalogue_products p ON p.id=o.product_id WHERE p.source_id=?`,
      [source.id],
    );
    assert.equal(Number(observationCount.n), 3);
    await writeFile(manifest, JSON.stringify({ ...config, expectedCount: 4 }));
    await writeFile(
      file,
      rowsIn
        .map((x) => JSON.stringify({ ...x, name: `Changed ${x.name}` }))
        .join("\n") + "\n",
    );
    await assert.rejects(
      () => importCatalogue(s.db, manifest, file),
      /not promoted/,
    );
    const unchanged = await first(
      s.db,
      "SELECT name FROM catalogue_products WHERE source_id=? AND source_product_id='FOOD-1'",
      [source.id],
    );
    assert.equal(unchanged.name, "Fixture rice");
    await writeFile(manifest, JSON.stringify(config));
    const malformedScope = structuredClone(rowsIn);
    malformedScope[0].offers[0].priceCents = 1199;
    malformedScope[0].offers[0].observedAt = new Date(Date.now() + 1000).toISOString();
    malformedScope[1].offers[0].locationId = "00000000-0000-4000-8000-000000003109";
    await writeFile(file, malformedScope.map((x) => JSON.stringify(x)).join("\n") + "\n");
    await assert.rejects(() => importCatalogue(s.db, manifest, file), /mismatched retailer\/channel/);
    const unchangedOffer = await first(s.db, "SELECT price_cents FROM store_offers WHERE source_id=? AND source_offer_id='FOOD-1'", [source.id]);
    assert.equal(unchangedOffer.price_cents, 1099);
  } finally {
    await s.close();
    const db = database(process.env.TEST_DATABASE_URL);
    try {
      const source = await first(
        db,
        "SELECT id FROM catalogue_sources WHERE retailer_id='costco' AND name=?",
        [sourceName],
      );
      if (source) {
        await execute(
          db,
          "DELETE FROM price_observations WHERE offer_id IN(SELECT o.id FROM store_offers o JOIN catalogue_products p ON p.id=o.product_id WHERE p.source_id=?)",
          [source.id],
        );
        await execute(
          db,
          "DELETE FROM store_offers WHERE product_id IN(SELECT id FROM catalogue_products WHERE source_id=?)",
          [source.id],
        );
        await execute(db, "DELETE FROM catalogue_products WHERE source_id=?", [
          source.id,
        ]);
        await execute(
          db,
          "DELETE FROM catalogue_import_errors WHERE run_id IN(SELECT id FROM catalogue_sync_runs WHERE source_id=?)",
          [source.id],
        );
        await execute(db, "DELETE FROM catalogue_sync_runs WHERE source_id=?", [
          source.id,
        ]);
        await execute(db, "DELETE FROM catalogue_sources WHERE id=?", [
          source.id,
        ]);
      }
    } finally {
      await db.end();
      await rm(folder, { recursive: true, force: true });
    }
  }
});
