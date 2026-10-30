import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, itemFromUnits } from "@poold/contracts";
import { setup, draft } from "./helpers.js";

const kd = CATALOG.find((c) => c.key === "kd-24")!;

test("Units: shares must split a pack evenly and match shares per pack", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const good = itemFromUnits({ ...kd, shareUnits: 4, packCount: 1 });
    assert.equal(good.sharesPerPack, 6);
    assert.equal(good.shareLabel, "4 boxes");
    const id = await h.create(draft({ items: [good] }));
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    assert.equal(v.items[0].packUnits, 24);
    assert.equal(v.items[0].shareUnits, 4);
    assert.equal(v.items[0].unit, "box");
    assert.equal(v.items[0].remaining, 6);

    // 30 eggs in shares of 7 cannot work.
    const uneven = { ...good, packUnits: 30, shareUnits: 7, sharesPerPack: 4 };
    let r = await call("/orders", "POST", draft({ items: [uneven] }), t.maya);
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /can’t be split evenly/);
    // 30 eggs in shares of 5 is 6 shares, not 10.
    const mismatch = {
      ...good,
      packUnits: 30,
      shareUnits: 5,
      sharesPerPack: 10,
    };
    r = await call("/orders", "POST", draft({ items: [mismatch] }), t.maya);
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /must be 6/);
    // A share bigger than the pack.
    const huge = { ...good, packUnits: 4, shareUnits: 8, sharesPerPack: 1 };
    r = await call("/orders", "POST", draft({ items: [huge] }), t.maya);
    assert.equal(r.status, 400);
  } finally {
    await h.close();
  }
});

test("Requests: creators edit/delete their own, groups take requests while open", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  const cola = `Cola ${Date.now()}`;
  try {
    // Community request: only the creator may edit or delete it.
    const name = `Oat milk ${Date.now()}`;
    const q = await call("/requests", "POST", { name }, t.jordan);
    assert.equal(q.status, 201);
    const rid = q.body.id;
    let list = (await call("/requests", "GET", undefined, t.jordan)).body;
    assert.equal(list.find((x: any) => x.id === rid).mine, true);
    assert.equal(
      (await call(`/requests/${rid}`, "PATCH", { name: "x" }, t.alex)).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/requests/${rid}`,
          "PATCH",
          { name: `${name} (unsweetened)`, note: "1 L cartons" },
          t.jordan,
        )
      ).status,
      200,
    );
    list = (await call("/requests", "GET", undefined, t.alex)).body;
    const edited = list.find((x: any) => x.id === rid);
    assert.equal(edited.name, `${name} (unsweetened)`);
    assert.equal(edited.mine, false);
    assert.equal(
      (await call(`/requests/${rid}`, "DELETE", undefined, t.alex)).status,
      403,
    );
    assert.equal(
      (await call(`/requests/${rid}`, "DELETE", undefined, t.jordan)).status,
      200,
    );

    // Group requests.
    const oid = await h.create(
      draft({ items: [itemFromUnits({ ...kd, shareUnits: 4, packCount: 1 })] }),
    );
    // Not while it is a draft.
    assert.equal(
      (await call(`/orders/${oid}/requests`, "POST", { name: "Tea" }, t.jordan))
        .status,
      404,
    );
    await h.publish(oid);
    // The organizer adds items directly rather than requesting them.
    assert.equal(
      (await call(`/orders/${oid}/requests`, "POST", { name: "Tea" }, t.maya))
        .status,
      409,
    );
    const g = await call(
      `/orders/${oid}/requests`,
      "POST",
      { name: "Aylmer diced tomatoes", note: "2 cans would be great" },
      t.jordan,
    );
    assert.equal(g.status, 201);
    const g2 = await call(
      `/orders/${oid}/requests`,
      "POST",
      { name: cola },
      t.alex,
    );
    // Same name may exist both community-wide and inside a group.
    assert.equal(
      (await call("/requests", "POST", { name: cola }, t.alex)).status,
      201,
    );
    const groupList = (
      await call(`/orders/${oid}/requests`, "GET", undefined, t.maya)
    ).body;
    assert.equal(groupList.length, 2);
    assert.ok(
      !(await call("/requests", "GET", undefined, t.maya)).body.some(
        (x: any) => x.id === g.body.id,
      ),
    );
    // Only the organizer adds items; adding from a request marks it added.
    const before = (await call(`/orders/${oid}`, "GET", undefined, t.jordan))
      .body.order.revision;
    const tomatoes = itemFromUnits({
      ...CATALOG.find((c) => c.key === "aylmer-tomatoes-8")!,
      shareUnits: 2,
      packCount: 1,
    });
    assert.equal(
      (
        await call(
          `/orders/${oid}/items`,
          "POST",
          { item: tomatoes, requestId: g.body.id },
          t.jordan,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/orders/${oid}/items`,
          "POST",
          { item: tomatoes, requestId: g.body.id },
          t.maya,
        )
      ).status,
      201,
    );
    const view = (await call(`/orders/${oid}`, "GET", undefined, t.jordan))
      .body;
    assert.equal(view.items.length, 2);
    // Existing claims must re-confirm against the new revision.
    assert.equal(view.order.revision, before + 1);
    assert.equal(
      (
        await call(
          `/orders/${oid}/requests/${g2.body.id}/decline`,
          "POST",
          {},
          t.maya,
        )
      ).status,
      200,
    );
    const after = (
      await call(`/orders/${oid}/requests`, "GET", undefined, t.jordan)
    ).body;
    assert.deepEqual(after.map((x: any) => x.status).sort(), [
      "added",
      "declined",
    ]);
    // Answered requests can no longer be edited or deleted.
    assert.equal(
      (
        await call(
          `/requests/${g.body.id}`,
          "PATCH",
          { name: "Other" },
          t.jordan,
        )
      ).status,
      409,
    );
    const updates = (await call("/notifications", "GET", undefined, t.jordan))
      .body;
    assert.ok(updates.some((u: any) => /was added to/.test(u.message)));
    // Closed groups stop taking requests and new items.
    assert.equal(
      (
        await call(
          `/orders/${oid}/status`,
          "POST",
          { status: "locked" },
          t.maya,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${oid}/requests`, "POST", { name: "Tea" }, t.alex))
        .status,
      409,
    );
    assert.equal(
      (await call(`/orders/${oid}/items`, "POST", { item: tomatoes }, t.maya))
        .status,
      409,
    );
  } finally {
    await h.close();
  }
});
