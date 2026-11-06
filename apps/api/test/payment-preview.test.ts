import test from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
test("payment preview uses fixed pricing, excludes organizer costs and exposes only the current buyer payment", async () => {
  const h = await setup();
  try {
    const oid = await h.create();
    await h.publish(oid);
    await h.claim(oid, h.tokens.maya, 1);
    await h.claim(oid, h.tokens.jordan, 2);
    await h.claim(oid, h.tokens.alex, 2);
    const q = (
      await h.call(
        `/orders/${oid}/payment-preview`,
        "GET",
        undefined,
        h.tokens.jordan,
      )
    ).body;
    assert.equal(q.provider, "demo");
    assert.equal(q.livePaymentsEnabled, false);
    assert.equal(q.quote.groceryCents, 400);
    assert.equal(q.quote.markupCents, 60);
    assert.equal(q.quote.totalCents, 483);
    assert.equal(q.organizer, null);
    assert.equal(q.quote.maximum, undefined);
    assert.equal(q.viable, false);
    const org = (
      await h.call(
        `/orders/${oid}/payment-preview`,
        "GET",
        undefined,
        h.tokens.maya,
      )
    ).body;
    assert.equal(org.quote, null);
    assert.equal(org.organizer.groceryCents, 801);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/payment-checkout`,
          "POST",
          {},
          h.tokens.jordan,
        )
      ).status,
      503,
    );
  } finally {
    await h.close();
  }
});
