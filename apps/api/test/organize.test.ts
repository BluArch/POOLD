import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";
test("Phase B: drafts, validation, publish and private invite privacy", async () => {
  const h = await setup();
  const { tokens: t, call } = h;
  try {
    for (const userId of ["demo-jordan", "demo-alex", "demo-priya"]) {
      assert.equal(
        (await call("/auth/demo", "POST", { userId, native: true })).status,
        400,
      );
    }
    assert.equal(
      (await call("/orders", "POST", draft({ maxMembers: 11 }), t.maya)).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/orders",
          "POST",
          draft({ pickupAt: new Date().toISOString() }),
          t.maya,
        )
      ).status,
      400,
    );
    const id = await h.create();
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.jordan)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}`,
          "PUT",
          draft({ name: "Edited draft" }),
          t.maya,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${id}/publish`, "POST", {}, t.jordan)).status,
      404,
    );
    await h.publish(id);
    assert.ok(
      (await call("/orders", "GET", undefined, t.jordan)).body.some(
        (o: any) => o.id === id,
      ),
    );
    assert.equal(
      (await call(`/orders/${id}`, "PUT", draft(), t.maya)).status,
      409,
    );
    const p = await h.create(draft({ visibility: "private" }));
    await h.publish(p);
    const view = (await call(`/orders/${p}`, "GET", undefined, t.maya)).body;
    assert.equal(
      (await call(`/orders/${p}`, "GET", undefined, t.jordan)).status,
      404,
    );
    const invited = await call(
      `/orders/${p}?invite=${view.inviteToken}`,
      "GET",
      undefined,
      t.jordan,
    );
    assert.equal(invited.status, 200);
    assert.equal(invited.body.inviteToken, undefined);
    assert.deepEqual(invited.body.members, []);
    assert.ok(
      !(await call("/orders", "GET", undefined, t.jordan)).body.some(
        (o: any) => o.id === p,
      ),
    );
  } finally {
    await h.close();
  }
});
