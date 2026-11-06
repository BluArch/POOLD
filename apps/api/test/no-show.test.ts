import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";
import { runJobs } from "../src/jobs.js";
import { execute } from "../src/db.js";

const later = (iso: string, hours: number) =>
  new Date(Date.parse(iso) + hours * 3600000);

test("no-shows: organizer who never shops is cancelled and buyers are refunded", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const input = draft();
    input.items[0].priceCents = 200000;
    const id = await h.create(input);
    await h.publish(id);
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    await h.claim(id, t.maya);
    await h.claim(id, t.jordan);
    // Shares closed and the buyer was charged when shopping started...
    const status = (s: string) =>
      call(`/orders/${id}/status`, "POST", { status: s }, t.maya);
    await call(
      `/orders/${id}/items/${v.items[0].id}`,
      "PATCH",
      { shortfallDecision: "proceed" },
      t.maya,
    );
    await h.closeFunding(id);
    await status("shopping");
    assert.ok(
      (await call(`/orders/${id}`, "GET", undefined, t.jordan)).body.mine
        .paidCents > 0,
    );
    // ...but the organizer never opened pickup.
    // Nothing happens until the 24-hour hold after pickup has passed.
    await runJobs(h.db, later(v.order.pickupEnd, 23));
    assert.notEqual(
      (await call(`/orders/${id}`, "GET", undefined, t.maya)).body.order.status,
      "cancelled",
    );
    await runJobs(h.db, later(v.order.pickupEnd, 25));
    const buyer = (await call(`/orders/${id}`, "GET", undefined, t.jordan))
      .body;
    assert.equal(buyer.order.status, "cancelled");
    assert.equal(buyer.mine.paidCents, 0);
    const organizer = (await call("/profile", "GET", undefined, t.maya)).body;
    assert.ok(organizer.noShows >= 1);
  } finally {
    await execute(h.db, "DELETE FROM no_shows WHERE user_id='demo-maya'");
    await h.close();
  }
});

test("no-shows: a buyer who misses pickup forfeits after the hold", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const input = draft();
    input.items[0].priceCents = 150000;
    const id = await h.create(input);
    await h.publish(id);
    let v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    const iid = v.items[0].id;
    await h.claim(id, t.maya);
    await h.claim(id, t.jordan, 2);
    const status = (s: string) =>
      call(`/orders/${id}/status`, "POST", { status: s }, t.maya);
    await call(
      `/orders/${id}/items/${iid}`,
      "PATCH",
      { shortfallDecision: "proceed" },
      t.maya,
    );
    await h.closeFunding(id);
    await status("shopping");
    await call(`/orders/${id}/items/${iid}`, "PATCH", { bought: true }, t.maya);
    const photo = "data:image/png;base64,iVBORw0KGgo=";
    await call(
      `/orders/${id}/proof`,
      "POST",
      { receiptPhoto: photo, itemsPhoto: photo, receiptTotalCents: 1199 },
      t.maya,
    );
    assert.equal((await status("ready")).status, 200);
    const paid = (await call(`/orders/${id}`, "GET", undefined, t.jordan)).body
      .mine.paidCents;
    v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    await runJobs(h.db, later(v.order.pickupEnd, 25));
    const org = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    assert.equal(org.order.status, "completed");
    const jordan = org.members.find((m: any) => m.userId === "demo-jordan");
    assert.ok(jordan.noShowAt);
    // The buyer's payment stays with the organizer.
    assert.equal(jordan.paidCents, paid);
    assert.equal(
      org.payouts.releasedCents,
      org.payouts.groceryCents + org.payouts.rewardCents,
    );
    const profile = (await call("/profile", "GET", undefined, t.jordan)).body;
    assert.ok(profile.noShows >= 1);
  } finally {
    await execute(h.db, "DELETE FROM no_shows WHERE user_id='demo-jordan'");
    await h.close();
  }
});
