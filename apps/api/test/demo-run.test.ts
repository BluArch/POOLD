import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";

test("demo: Maya runs a whole group alone with sample buyers", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const input = draft();
    input.items[0].priceCents = 50000;
    const id = await h.create(input);
    await h.publish(id);
    await h.claim(id, t.maya);
    const view = async () =>
      (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    // Only the demo account can add sample buyers.
    assert.equal(
      (await call(`/orders/${id}/demo-buyers`, "POST", {}, t.jordan)).status,
      403,
    );
    assert.equal(
      (await call(`/orders/${id}/demo-buyers`, "POST", {}, t.maya)).status,
      200,
    );
    let v = await view();
    // Every started pack is now full, so there are no shortfalls.
    for (const i of v.items)
      assert.equal(i.claimed % i.sharesPerPack, 0, i.name);
    assert.ok(v.members.length >= 2);
    const status = async (s: string) =>
      (await call(`/orders/${id}/status`, "POST", { status: s }, t.maya))
        .status;
    await h.closeFunding(id);
    assert.equal(await status("shopping"), 200);
    v = await view();
    for (const i of v.items)
      await call(
        `/orders/${id}/items/${i.id}`,
        "PATCH",
        { bought: true },
        t.maya,
      );
    const px =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await call(
      `/orders/${id}/proof`,
      "POST",
      { receiptPhoto: px, itemsPhoto: px, receiptTotalCents: 5000 },
      t.maya,
    );
    assert.equal(await status("ready"), 200);
    // Maya sees each sample buyer's code and can hand everything out.
    v = await view();
    for (const m of v.members.filter((m: any) => m.userId !== "demo-maya")) {
      assert.match(m.demoCode, /^\d{6}$/);
      assert.equal(
        (
          await call(
            `/orders/${id}/collect`,
            "POST",
            { code: m.demoCode, userId: m.userId },
            t.maya,
          )
        ).status,
        200,
      );
    }
    assert.equal(await status("completed"), 200);
    v = await view();
    assert.equal(
      v.payouts.releasedCents,
      v.payouts.groceryCents + v.payouts.rewardCents,
    );
  } finally {
    await h.close();
  }
});
