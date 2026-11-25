import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { itemFromUnits } from "@poold/contracts";
import { database, execute, first } from "../src/db.js";
import { refreshCostcoLangford } from "../src/refresh-costco-langford.js";
import {
  costcoProductId,
  readCostcoTile,
} from "../src/scrape-costco-langford.js";
import { draft, setup } from "./helpers.js";

test("Costco tiles use the online price and only explicit Langford stock", () => {
  assert.equal(
    costcoProductId("https://www.costco.ca/p/-/sample/4000111232"),
    "4000111232",
  );
  assert.equal(
    costcoProductId("https://example.com/p/-/sample/4000111232"),
    null,
  );
  assert.deepEqual(
    readCostcoTile({
      price: "$1,234.56",
      warehouse: "Buy in Warehouse\nIn Stock\nat Langford",
      lines: [],
    }),
    {
      onlinePackPriceCents: 123456,
      warehouseStock: "available",
    },
  );
  assert.deepEqual(
    readCostcoTile({
      price: "$19.99 – $24.99",
      lines: ["Warehouse Only", "Out of Stock", "at Langford"],
    }),
    {
      onlinePackPriceCents: undefined,
      warehouseStock: "unavailable",
    },
  );
  assert.deepEqual(
    readCostcoTile({
      price: "$16.99",
      warehouse: "Out of Stock\nat Nanaimo",
      lines: ["Delivery", "Out of Stock"],
    }),
    {
      onlinePackPriceCents: 1699,
      warehouseStock: undefined,
    },
  );
});

test("branch catalogue search and linked item snapshots reject stale or cross-branch offers", async () => {
  const s = await setup();
  const source = randomUUID(),
    product = randomUUID(),
    offer = randomUUID(),
    observation = randomUUID();
  const branch = "00000000-0000-4000-8000-000000000256";
  try {
    await execute(
      s.db,
      `INSERT INTO catalogue_sources(id,retailer_id,name,channel,access_method,coverage_note,rights_note)
      VALUES(?, 'costco', ?, 'warehouse', 'test fixture', 'one fixture', 'test only')`,
      [source, source],
    );
    await execute(
      s.db,
      `INSERT INTO catalogue_products(id,source_id,source_product_id,name,source_category,category,pack_label,unit,pack_units,unit_detail)
      VALUES(?,?, 'TEST-24', 'Fixture cans', 'Grocery', 'Canned goods', '24 cans', 'can',24,'540 mL each')`,
      [product, source],
    );
    await execute(
      s.db,
      `INSERT INTO store_offers(id,source_id,product_id,location_id,source_offer_id,price_basis,price_cents,tax_included,orderable,observed_at)
      VALUES(?,?,?,?,'TEST-24','pack',2400,TRUE,TRUE,UTC_TIMESTAMP(3))`,
      [offer, source, product, branch],
    );
    await execute(
      s.db,
      `INSERT INTO price_observations(id,offer_id,price_cents,currency,price_basis,tax_included,deposit_cents,observed_at)
      VALUES(?,?,2400,'CAD','pack',FALSE,0,UTC_TIMESTAMP(3))`,
      [observation, offer],
    );

    const page = await s.call(
      `/catalogue/products?retailerId=costco&locationId=${branch}&query=Fixture`,
    );
    assert.equal(page.status, 200);
    assert.ok(page.body.items.some((x: any) => x.offerId === offer));
    const elsewhere = await s.call(
      `/catalogue/products?retailerId=walmart&locationId=00000000-0000-4000-8000-000000003109`,
    );
    assert.equal(elsewhere.status, 200);
    assert.ok(!elsewhere.body.items.some((x: any) => x.offerId === offer));

    const selected = itemFromUnits({
      name: "Wrong title",
      category: "Pantry",
      unit: "can",
      packUnits: 24,
      shareUnits: 6,
      priceCents: 2400,
      packCount: 1,
      storage: "",
      offerId: offer,
      offerRevision: 1,
    });
    const body = draft({
      retailerId: "costco",
      locationId: branch,
      items: [selected],
    });
    const created = await s.call("/orders", "POST", body, s.tokens.maya);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    s.ids.push(created.body.id);
    const view = await s.call(
      `/orders/${created.body.id}`,
      "GET",
      undefined,
      s.tokens.maya,
    );
    assert.equal(view.body.items[0].name, "Fixture cans");
    assert.equal(view.body.items[0].priceCents, 2400);
    assert.equal(view.body.items[0].offerId, offer);

    const forged = await s.call(
      "/orders",
      "POST",
      draft({
        retailerId: "costco",
        locationId: branch,
        items: [{ ...selected, priceCents: 1 }],
      }),
      s.tokens.maya,
    );
    assert.equal(forged.status, 409);
    const otherBranch = await s.call(
      "/orders",
      "POST",
      draft({
        retailerId: "walmart",
        locationId: "00000000-0000-4000-8000-000000003109",
        items: [selected],
      }),
      s.tokens.maya,
    );
    assert.equal(otherBranch.status, 409);

    await execute(
      s.db,
      "UPDATE catalogue_sources SET access_method='synthetic-demo' WHERE id=?",
      [source],
    );
    const demo = await s.call("/orders", "POST", body, s.tokens.maya);
    assert.equal(demo.status, 201);
    s.ids.push(demo.body.id);
    const demoView = await s.call(
      `/orders/${demo.body.id}`,
      "GET",
      undefined,
      s.tokens.maya,
    );
    assert.equal(demoView.body.items[0].priceSource, "demo");
    assert.equal(demoView.body.order.demoPrices, true);

    await execute(
      s.db,
      "UPDATE store_offers SET price_cents=2600,revision=revision+1 WHERE id=?",
      [offer],
    );
    const blockedPublish = await s.call(
      `/orders/${created.body.id}/publish`,
      "POST",
      {},
      s.tokens.maya,
    );
    assert.equal(blockedPublish.status, 409);
    const stale = await s.call("/orders", "POST", body, s.tokens.maya);
    assert.equal(stale.status, 409);
    const original = await s.call(
      `/orders/${created.body.id}`,
      "GET",
      undefined,
      s.tokens.maya,
    );
    assert.equal(original.body.items[0].priceCents, 2400);
  } finally {
    await s.close();
    const db = database(process.env.TEST_DATABASE_URL);
    try {
      await execute(db, "DELETE FROM price_observations WHERE id=?", [
        observation,
      ]);
      await execute(db, "DELETE FROM store_offers WHERE id=?", [offer]);
      await execute(db, "DELETE FROM catalogue_products WHERE id=?", [product]);
      await execute(db, "DELETE FROM catalogue_sources WHERE id=?", [source]);
    } finally {
      await db.end();
    }
  }
});

test("Costco online reference prices prefill a manual estimate and only buyers see markup", async () => {
  const s = await setup();
  const source = randomUUID(),
    product = randomUUID(),
    offer = randomUUID();
  const locationId = "00000000-0000-4000-8000-000000000256";
  try {
    await execute(
      s.db,
      `INSERT INTO catalogue_sources(id,retailer_id,name,channel,access_method,coverage_note,rights_note)
      VALUES(?,'costco',?,'warehouse','costco-online-reference','web estimate','test only')`,
      [source, source],
    );
    await execute(
      s.db,
      `INSERT INTO catalogue_products(id,source_id,source_product_id,name,source_category,category,pack_label,unit,pack_units,unit_detail)
      VALUES(?,?,'TEST-REF-8827199','Fixture air spray','Household','Household','4 cans','can',4,'250 g each')`,
      [product, source],
    );
    await execute(
      s.db,
      `INSERT INTO store_offers(id,source_id,product_id,location_id,source_offer_id,price_basis,price_cents,observed_at)
      VALUES(?,?,?,?,'TEST-REF-8827199','pack',1699,UTC_TIMESTAMP(3) - INTERVAL 30 DAY)`,
      [offer, source, product, locationId],
    );

    const page = await s.call(
      `/catalogue/products?retailerId=costco&locationId=${locationId}&query=TEST-REF-8827199`,
    );
    assert.equal(page.status, 200);
    const [picked] = page.body.items;
    assert.equal(picked.id, product);
    assert.equal(picked.priceCents, 1699);
    assert.equal(picked.priceSource, "online-reference");
    assert.equal(picked.availability, "unknown");
    assert.equal(picked.offerId, null);
    assert.equal(picked.revision, null);
    const selected = itemFromUnits({
      name: picked.name,
      category: picked.category,
      unit: picked.unit,
      packUnits: picked.packUnits,
      shareUnits: 1,
      priceCents: picked.priceCents,
      packCount: 1,
      storage: "",
      offerId: picked.offerId,
      offerRevision: picked.revision,
    });
    const body = draft({ retailerId: "costco", locationId, items: [selected] });
    const invalidLink = await s.call(
      "/orders",
      "POST",
      { ...body, items: [{ ...selected, offerId: offer, offerRevision: 1 }] },
      s.tokens.maya,
    );
    assert.equal(invalidLink.status, 409);

    const id = await s.create(body);
    await s.publish(id);
    const organizer = await s.call(
      `/orders/${id}`,
      "GET",
      undefined,
      s.tokens.maya,
    );
    const buyer = await s.call(
      `/orders/${id}`,
      "GET",
      undefined,
      s.tokens.jordan,
    );
    assert.equal(organizer.body.items[0].priceCents, 1699);
    assert.equal(organizer.body.items[0].shareEstimateCents, 425);
    assert.equal(buyer.body.items[0].shareEstimateCents, 489);
  } finally {
    await s.close();
    const db = database(process.env.TEST_DATABASE_URL);
    try {
      await execute(db, "DELETE FROM store_offers WHERE id=?", [offer]);
      await execute(db, "DELETE FROM catalogue_products WHERE id=?", [product]);
      await execute(db, "DELETE FROM catalogue_sources WHERE id=?", [source]);
    } finally {
      await db.end();
    }
  }
});

test("Langford refresh tracks online price and warehouse stock independently", async () => {
  const s = await setup();
  const source = randomUUID(),
    product = randomUUID(),
    offer = randomUUID();
  const branch = "00000000-0000-4000-8000-000000000256";
  const itemNumber = "984320111999";
  const cataloguePath = `/catalogue/products?retailerId=costco&locationId=${branch}&query=${itemNumber}`;
  const older = new Date(Date.now() - 30_000).toISOString();
  const newer = new Date().toISOString();
  const update = (
    observedAt: string,
    values: { onlinePackPriceCents?: number; warehouseStock?: string },
  ) =>
    refreshCostcoLangford(s.db, {
      source: "costco.ca",
      warehouseId: "256",
      currency: "CAD",
      observedAt,
      items: [{ itemNumber, ...values }],
    });
  try {
    await execute(
      s.db,
      `INSERT INTO catalogue_sources(id,retailer_id,name,channel,access_method,coverage_note,rights_note)
      VALUES(?,'costco','Costco.ca shelf-stable price reference','warehouse','costco-online-reference','fixture','fixture')`,
      [source],
    );
    await execute(
      s.db,
      `INSERT INTO catalogue_products(id,source_id,source_product_id,name,source_category,category,pack_label,unit,pack_units)
      VALUES(?,?,?,'Fixture jars','Pantry','Pantry','4 jars','jar',4)`,
      [product, source, itemNumber],
    );
    await execute(
      s.db,
      `INSERT INTO store_offers(id,source_id,product_id,location_id,source_offer_id,price_basis,price_cents)
      VALUES(?,?,?,?,?,'pack',1699)`,
      [offer, source, product, branch, `costco-ca:${itemNumber}`],
    );

    await update(newer, { warehouseStock: "unavailable" });
    await assert.rejects(
      update(newer, {
        onlinePackPriceCents: 1999,
        warehouseStock: "available",
      }),
      /Conflicting Langford stock/,
    );
    const afterFailedUpdate = (await s.call(cataloguePath)).body.items[0];
    assert.equal(afterFailedUpdate.priceCents, 1699);
    assert.equal(afterFailedUpdate.availability, "unavailable");

    const priceUpdate = {
      onlinePackPriceCents: 1899,
      warehouseStock: "available",
    };
    await update(older, priceUpdate);
    await update(older, priceUpdate);
    const afterRetry = (await s.call(cataloguePath)).body.items[0];
    assert.equal(afterRetry.priceCents, 1899);
    assert.equal(afterRetry.availability, "unavailable");
    assert.equal(afterRetry.offerId, null);
    const observations = await first(
      s.db,
      "SELECT COUNT(*) AS n FROM price_observations WHERE offer_id=?",
      [offer],
    );
    assert.equal(Number(observations?.n), 1);

    await execute(
      s.db,
      "UPDATE store_offers SET stock_observed_at=UTC_TIMESTAMP(3) - INTERVAL 27 HOUR WHERE id=?",
      [offer],
    );
    const expired = (await s.call(cataloguePath)).body.items[0];
    assert.equal(expired.availability, "unknown");
    assert.equal(expired.priceCents, 1899);
  } finally {
    try {
      await execute(s.db, "DELETE FROM price_observations WHERE offer_id=?", [
        offer,
      ]);
      await execute(s.db, "DELETE FROM store_offers WHERE id=?", [offer]);
      await execute(s.db, "DELETE FROM catalogue_products WHERE id=?", [
        product,
      ]);
      await execute(s.db, "DELETE FROM catalogue_sources WHERE id=?", [source]);
    } finally {
      await s.close();
    }
  }
});
