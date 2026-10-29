import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";
import { execute, first, rows } from "../src/db.js";
import { runJobs } from "../src/jobs.js";
import { dispatchPush } from "../src/push.js";
import { notify } from "../src/notifications.js";
import { transaction } from "../src/db.js";
test("Phase E: duplicate-safe requests, votes, scoped updates, invitations and devices", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  let rid: string | undefined;
  try {
    const name = `Blueberries ${Date.now()}`;
    const q = await call(
      "/requests",
      "POST",
      { name, note: "Small freezer portion" },
      t.jordan,
    );
    assert.equal(q.status, 201);
    rid = q.body.id;
    assert.equal(
      (
        await call(
          "/requests",
          "POST",
          { name: `  ${name.toUpperCase()}  ` },
          t.alex,
        )
      ).status,
      409,
    );
    await Promise.all([
      call(`/requests/${rid}/vote`, "PUT", { voted: true }, t.alex),
      call(`/requests/${rid}/vote`, "PUT", { voted: true }, t.alex),
    ]);
    assert.equal(
      (await call("/requests", "GET", undefined, t.alex)).body.find(
        (q: any) => q.id === rid,
      ).votes,
      2,
    );
    await call(`/requests/${rid}/vote`, "PUT", { voted: false }, t.alex);
    await call(`/requests/${rid}/vote`, "PUT", { voted: false }, t.alex);
    assert.equal(
      (await call("/requests", "GET", undefined, t.alex)).body.find(
        (q: any) => q.id === rid,
      ).votes,
      1,
    );
    const id = await h.create(draft({ visibility: "private" }));
    await h.publish(id);
    assert.equal(
      (
        await call(
          `/orders/${id}/invite`,
          "POST",
          { email: "alex@demo.poold.invalid" },
          t.jordan,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/invite`,
          "POST",
          { email: "alex@demo.poold.invalid" },
          t.maya,
        )
      ).status,
      200,
    );
    await call(
      `/orders/${id}/invite`,
      "POST",
      { email: "alex@demo.poold.invalid" },
      t.maya,
    );
    const updates = (await call("/notifications", "GET", undefined, t.alex))
      .body;
    assert.equal(updates.filter((n: any) => n.orderId === id).length, 1);
    assert.ok(
      Math.abs(
        Date.now() -
          Date.parse(updates.find((n: any) => n.orderId === id).createdAt),
      ) < 60_000,
      "Notification defaults must use UTC regardless of MySQL system timezone.",
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.alex)).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.jordan)).status,
      404,
    );
    assert.ok(
      !(await call("/notifications", "GET", undefined, t.jordan)).body.some(
        (n: any) => n.orderId === id,
      ),
    );
    await call("/notifications/read", "POST", {}, t.alex);
    assert.ok(
      (await call("/notifications", "GET", undefined, t.alex)).body.every(
        (n: any) => n.seen,
      ),
    );
    const device = `test-token-${Date.now()}-abcdef123456`;
    await call(
      "/devices",
      "PUT",
      { token: device, platform: "android" },
      t.alex,
    );
    await call("/devices", "DELETE", { token: device }, t.jordan);
    assert.ok(
      await first(h.db, "SELECT token FROM device_tokens WHERE token=?", [
        device,
      ]),
    );
    await call("/devices", "DELETE", { token: device }, t.alex);
    assert.equal(
      await first(h.db, "SELECT token FROM device_tokens WHERE token=?", [
        device,
      ]),
      undefined,
    );
  } finally {
    if (rid)
      await execute(h.db, "DELETE FROM product_requests WHERE id=?", [rid]);
    await h.close();
  }
});
test("Phase E: idempotent concurrent jobs close deadlines and issue pickup reminders once", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const now = new Date();
    await execute(
      h.db,
      "UPDATE orders SET deadline=?,purchase_at=?,pickup_at=?,pickup_end=? WHERE id=?",
      [
        new Date(+now - 1000),
        now,
        new Date(+now + 3600000),
        new Date(+now + 7200000),
        id,
      ],
    );
    await Promise.all([runJobs(h.db, now), runJobs(h.db, now)]);
    await runJobs(h.db, now);
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.maya)).body.order.status,
      "locked",
    );
    const ns = await rows(
      h.db,
      "SELECT * FROM notifications WHERE order_id=?",
      [id],
    );
    assert.equal(
      ns.filter((n) => n.event_key === `deadline-close:${id}`).length,
      1,
    );
    assert.equal(
      ns.filter((n) => n.event_key === `pickup-reminder:${id}`).length,
      1,
    );
    assert.equal(
      (
        await call(
          `/orders/${id}/claims`,
          "PUT",
          { attending: true, revision: 1, claims: [] },
          t.jordan,
        )
      ).status,
      409,
    );
    const nid = `push-test-${Date.now()}`;
    await transaction(h.db, (c) =>
      notify(c, "demo-maya", id, "Test update", nid),
    );
    let sends = 0;
    await execute(
      h.db,
      "INSERT INTO device_tokens VALUES(?,?,?,UTC_TIMESTAMP(3))",
      [nid + "-device-token", "demo-maya", "android"],
    );
    await dispatchPush(h.db, async () => {
      sends++;
      return { invalidTokens: [] };
    });
    const before = sends;
    await dispatchPush(h.db, async () => {
      sends++;
      return { invalidTokens: [] };
    });
    assert.equal(sends, before);
    assert.ok(before >= 1);
    assert.deepEqual(await dispatchPush(h.db, null), {
      sent: 0,
      configured: false,
    });
    await execute(h.db, "DELETE FROM device_tokens WHERE token=?", [
      nid + "-device-token",
    ]);
  } finally {
    await h.close();
  }
});
