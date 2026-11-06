import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";
test("Phase D: lock, resolve shortfall, shop, pack, collect once, complete and repeat", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const view = async (auth = t.maya) =>
      (await call(`/orders/${id}`, "GET", undefined, auth)).body;
    let v = await view();
    const iid = v.items[0].id;
    await call(
      `/orders/${id}/claims`,
      "PUT",
      { revision: 1, attending: true, claims: [{ itemId: iid, quantity: 2 }] },
      t.jordan,
    );
    const status = (status: string, auth = t.maya) =>
      call(`/orders/${id}/status`, "POST", { status }, auth);
    const change = (body: unknown, auth = t.maya) =>
      call(`/orders/${id}/items/${iid}`, "PATCH", body, auth);
    assert.equal((await status("shopping")).status, 409);
    assert.equal((await status("locked", t.jordan)).status, 403);
    // The organizer has to be buying too.
    assert.equal((await status("locked")).body.error.code, "ORGANIZER_SHARE");
    await h.claim(id, t.maya);
    // Nothing is charged before shares close.
    assert.equal((await view(t.jordan)).mine.paidCents, 0);
    assert.equal((await status("locked")).status, 200);
    // Closing places a hold on the buyer's card; still no charge.
    let buyer = await view(t.jordan);
    assert.equal(buyer.mine.hold.status, "authorized");
    assert.equal(
      buyer.mine.hold.amountCents,
      buyer.myEstimateCents + buyer.myFeeCents,
    );
    assert.equal(buyer.mine.paidCents, 0);
    // The organizer doesn't pay through the app.
    assert.equal((await view()).mine.hold, null);
    assert.equal((await status("shopping")).body.error.code, "SHORTFALL");
    await change({ shortfallDecision: "proceed" });
    assert.equal((await status("shopping")).status, 200);
    // Starting shopping charges the hold.
    buyer = await view(t.jordan);
    assert.equal(buyer.mine.hold.status, "captured");
    assert.equal(buyer.mine.paidCents, buyer.mine.hold.amountCents);
    assert.equal((await status("ready")).status, 409);
    assert.equal(
      (
        await call(
          `/orders/${id}/pack`,
          "POST",
          { userId: "demo-jordan", packed: true },
          t.maya,
        )
      ).status,
      409,
    );
    await change({ bought: true });
    // Pickup can't open until the receipt and items photo are uploaded.
    assert.equal((await status("ready")).body.error.code, "PROOF_REQUIRED");
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    assert.equal(
      (
        await call(
          `/orders/${id}/proof`,
          "POST",
          { receiptPhoto: photo, itemsPhoto: photo, receiptTotalCents: 1199 },
          t.maya,
        )
      ).status,
      200,
    );
    // No separate packing step: "Done shopping" opens pickup directly.
    assert.equal((await status("ready")).status, 200);
    v = await view();
    assert.equal(
      v.members.find((m: any) => m.userId === "demo-jordan").packed,
      true,
    );
    assert.equal(v.collectionCode, undefined);
    assert.equal(
      v.members.find((m: any) => m.userId === "demo-jordan").collectionCode,
      undefined,
    );
    const member = await view(t.jordan);
    assert.match(member.collectionCode, /^\d{6}$/);
    assert.equal((await change({ priceCents: 1500 })).status, 409);
    assert.equal((await status("completed")).status, 409);
    assert.equal(
      (await call(`/orders/${id}/arrive`, "POST", {}, t.jordan)).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/collect`,
          "POST",
          { code: member.collectionCode },
          t.jordan,
        )
      ).status,
      403,
    );
    // A code typed into the wrong member's card is rejected and stays unused.
    const wrongMember = await call(
      `/orders/${id}/collect`,
      "POST",
      { code: member.collectionCode, userId: "demo-alex" },
      t.maya,
    );
    assert.equal(wrongMember.status, 409);
    assert.equal(wrongMember.body.error.code, "WRONG_MEMBER");
    // The organizer's own bag needs no code.
    assert.equal(
      (await view()).members.find((m: any) => m.userId === "demo-maya")
        .collectedAt !== null,
      true,
    );
    const cs = await Promise.all([
      call(
        `/orders/${id}/collect`,
        "POST",
        { code: member.collectionCode, userId: "demo-jordan" },
        t.maya,
      ),
      call(
        `/orders/${id}/collect`,
        "POST",
        { code: member.collectionCode },
        t.maya,
      ),
    ]);
    assert.deepEqual(cs.map((r) => r.status).sort(), [200, 409]);
    // No-shows can only be marked after the 24-hour hold.
    assert.equal(
      (
        await call(
          `/orders/${id}/no-show`,
          "POST",
          { userId: "demo-jordan" },
          t.maya,
        )
      ).body.error.code,
      "GRACE_PERIOD",
    );
    // The Costco cost of buyers' shares was released for shopping.
    let org = await view();
    assert.equal(org.payouts.releasedCents, org.payouts.groceryCents);
    assert.ok(org.payouts.collectedCents > org.payouts.groceryCents);
    // After hand-out the organizer earns max($30, 10% of groceries).
    assert.equal(
      org.payouts.rewardCents,
      Math.max(3000, Math.round(org.payouts.groceryCents * 0.1)),
    );
    assert.equal((await status("completed")).status, 200);
    org = await view();
    assert.equal(
      org.payouts.releasedCents,
      org.payouts.groceryCents + org.payouts.rewardCents,
    );
    // The buyer rates the organizer; it shows on the organizer's profile.
    assert.equal((await view(t.jordan)).canRate, true);
    assert.equal(
      (
        await call(
          `/orders/${id}/rating`,
          "POST",
          { stars: 5, comment: "Smooth pickup" },
          t.jordan,
        )
      ).status,
      200,
    );
    assert.equal((await view(t.jordan)).myRating, 5);
    assert.equal(
      (await call(`/orders/${id}/rating`, "POST", { stars: 4 }, t.maya)).status,
      409,
    );
    const mayaProfile = (await call("/profile", "GET", undefined, t.maya)).body;
    assert.ok(mayaProfile.rating.count >= 1);
    const profile = (await call("/profile", "GET", undefined, t.jordan)).body;
    assert.ok(profile.completed >= 1);
    assert.ok(
      (await call("/profile", "GET", undefined, t.maya)).body.completed >= 1,
    );
    const dates = draft();
    const rep = await call(
      `/orders/${id}/repeat`,
      "POST",
      {
        deadline: dates.deadline,
        purchaseAt: dates.purchaseAt,
        pickupAt: dates.pickupAt,
        pickupEnd: dates.pickupEnd,
      },
      t.maya,
    );
    assert.equal(rep.status, 201);
    h.ids.push(rep.body.id);
    const fresh = (
      await call(`/orders/${rep.body.id}`, "GET", undefined, t.maya)
    ).body;
    assert.equal(fresh.order.status, "draft");
    assert.equal(fresh.items[0].claimed, 0);
    assert.equal(fresh.members.length, 1);
  } finally {
    await h.close();
  }
});
test("Phase D: unavailable items and changed prices invalidate estimates and notify", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body,
      iid = v.items[0].id;
    const claims = {
      revision: 1,
      attending: true,
      claims: [{ itemId: iid, quantity: 1 }],
    };
    await call(`/orders/${id}/claims`, "PUT", claims, t.jordan);
    assert.equal(
      (
        await call(
          `/orders/${id}/items/${iid}`,
          "PATCH",
          { priceCents: 1500 },
          t.alex,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/items/${iid}`,
          "PATCH",
          { priceCents: 1500 },
          t.maya,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${id}/claims`, "PUT", claims, t.jordan)).body.error
        .code,
      "ORDER_CHANGED",
    );
    const changed = (await call(`/orders/${id}`, "GET", undefined, t.jordan))
      .body;
    assert.equal(changed.myEstimateCents, 345);
    await call(
      `/orders/${id}/items/${iid}`,
      "PATCH",
      { available: false },
      t.maya,
    );
    const unavailable = (
      await call(`/orders/${id}`, "GET", undefined, t.jordan)
    ).body;
    assert.equal(unavailable.myEstimateCents, 0);
    assert.equal(unavailable.myClaims[0].quantity, 1);
    assert.equal(unavailable.myClaims[0].available, false);
    // With every share unavailable there's nothing to split.
    assert.equal(
      (await call(`/orders/${id}/status`, "POST", { status: "locked" }, t.maya))
        .body.error.code,
      "ORGANIZER_SHARE",
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/status`,
          "POST",
          { status: "cancelled" },
          t.maya,
        )
      ).status,
      200,
    );
  } finally {
    await h.close();
  }
});
