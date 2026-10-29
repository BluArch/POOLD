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
    assert.equal((await status("locked")).status, 200);
    assert.equal((await status("shopping")).body.error.code, "SHORTFALL");
    await change({ shortfallDecision: "proceed" });
    assert.equal((await status("shopping")).status, 200);
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
    assert.equal(
      (
        await call(
          `/orders/${id}/pack`,
          "POST",
          { userId: "demo-jordan", packed: true },
          t.maya,
        )
      ).status,
      200,
    );
    assert.equal((await status("ready")).status, 200);
    v = await view();
    assert.equal(v.collectionCode, undefined);
    assert.equal(
      v.members.find((m: any) => m.userId === "demo-jordan").collectionCode,
      undefined,
    );
    const member = await view(t.jordan);
    assert.match(member.collectionCode, /^[A-F0-9]{20}$/);
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
    const cs = await Promise.all([
      call(
        `/orders/${id}/collect`,
        "POST",
        { code: member.collectionCode },
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
    assert.equal((await status("completed")).status, 200);
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
    assert.equal(changed.myEstimateCents, 300);
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
    await call(`/orders/${id}/status`, "POST", { status: "locked" }, t.maya);
    assert.equal(
      (
        await call(
          `/orders/${id}/status`,
          "POST",
          { status: "shopping" },
          t.maya,
        )
      ).body.error.code,
      "NO_SHARES",
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
