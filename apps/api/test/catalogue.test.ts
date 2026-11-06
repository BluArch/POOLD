import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { itemFromUnits } from "@poold/contracts";
import { database, execute } from "../src/db.js";
import { draft, setup } from "./helpers.js";

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
