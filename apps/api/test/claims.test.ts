import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";
import { execute, first } from "../src/db.js";
test("Phase C: concurrent last-share claims, edits, rollback, costs and deadlines", async () => {
  const h = await setup();
  const { tokens: t, call } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const view = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    const item = view.items[0];
    const body = (quantity: number) => ({
      revision: 1,
      attending: true,
      claims: [{ itemId: item.id, quantity }],
    });
    const rs = await Promise.all([
      call(`/orders/${id}/claims`, "PUT", body(5), t.jordan),
      call(`/orders/${id}/claims`, "PUT", body(5), t.alex),
    ]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    const winner = rs[0].status === 200 ? t.jordan : t.alex;
    const v = (await call(`/orders/${id}`, "GET", undefined, winner)).body;
    assert.equal(v.items[0].remaining, 0);
    assert.equal(v.myEstimateCents, 1001);
    assert.deepEqual(v.members, []);
    assert.equal(
      (await call(`/orders/${id}/claims`, "PUT", body(6), winner)).status,
      409,
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, winner)).body.items[0]
        .mine,
      5,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/claims`,
          "PUT",
          {
            ...body(1),
            claims: [
              { itemId: item.id, quantity: 1 },
              { itemId: "00000000-0000-4000-8000-000000000000", quantity: 1 },
            ],
          },
          winner,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, winner)).body.items[0]
        .mine,
      5,
    );
    assert.equal(
      (await call(`/orders/${id}/claims`, "PUT", body(2), winner)).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, winner)).body
        .myEstimateCents,
      400,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/claims`,
          "PUT",
          { ...body(1), attending: false },
          winner,
        )
      ).status,
      400,
    );
    await execute(h.db, "UPDATE orders SET deadline=? WHERE id=?", [
      new Date(Date.now() - 1000),
      id,
    ]);
    assert.equal(
      (await call(`/orders/${id}/claims`, "PUT", body(0), winner)).status,
      409,
    );
    assert.equal(
      Number(
        (
          await first(
            h.db,
            "SELECT SUM(quantity) AS n FROM share_claims WHERE item_id=?",
            [item.id],
          )
        ).n,
      ),
      2,
    );
  } finally {
    await h.close();
  }
});
test("Phase C: simultaneous joins for one membership slot and private membership persistence", async () => {
  const h = await setup();
  const { tokens: t, call } = h;
  try {
    const id = await h.create(draft({ maxMembers: 2 }));
    await h.publish(id);
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    const b = {
      revision: 1,
      attending: true,
      claims: [{ itemId: v.items[0].id, quantity: 1 }],
    };
    const rs = await Promise.all([
      call(`/orders/${id}/claims`, "PUT", b, t.jordan),
      call(`/orders/${id}/claims`, "PUT", b, t.alex),
    ]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.maya)).body.order
        .memberCount,
      2,
    );
    const winner = rs[0].status === 200 ? t.jordan : t.alex;
    await call(`/orders/${id}/claims`, "PUT", { ...b, attending:false, claims: [] }, winner);
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.maya)).body.order
        .memberCount,
      1,
    );
    const p = await h.create(draft({ visibility: "private" }));
    await h.publish(p);
    const pv = (await call(`/orders/${p}`, "GET", undefined, t.maya)).body;
    const pb = {
      revision: 1,
      attending: true,
      claims: [{ itemId: pv.items[0].id, quantity: 1 }],
    };
    assert.equal(
      (await call(`/orders/${p}/claims`, "PUT", pb, t.jordan)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/orders/${p}/claims?invite=${pv.inviteToken}`,
          "PUT",
          pb,
          t.jordan,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${p}`, "GET", undefined, t.jordan)).status,
      200,
    );
  } finally {
    await h.close();
  }
});
