import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { execute } from "../src/db.js";
import { runJobs } from "../src/jobs.js";

test("payments: no charge while open, hold at close, charge when shopping starts", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const view = async (auth: string) =>
      (await call(`/orders/${id}`, "GET", undefined, auth)).body;
    const iid = (await view(t.maya)).items[0].id;
    // Changing your mind while open costs nothing.
    await h.claim(id, t.jordan, 2);
    await h.claim(id, t.jordan, 1);
    let jordan = await view(t.jordan);
    assert.equal(jordan.mine.paidCents, 0);
    assert.equal(jordan.mine.payments.length, 0);
    assert.equal(jordan.mine.hold, null);
    assert.equal(jordan.myFeeCents, Math.round(jordan.myEstimateCents * 0.05));
    await h.claim(id, t.maya);
    // Organizers pay at the store, not in the app.
    const maya = await view(t.maya);
    assert.equal(maya.myFeeCents, 0);
    assert.equal(maya.mine.dueCents, 0);
    const status = (s: string) =>
      call(`/orders/${id}/status`, "POST", { status: s }, t.maya);
    assert.equal((await status("locked")).status, 200);
    jordan = await view(t.jordan);
    const owed = jordan.myEstimateCents + jordan.myFeeCents;
    assert.equal(jordan.mine.hold.status, "authorized");
    assert.equal(jordan.mine.hold.amountCents, owed);
    // A price change while closed updates the hold, still no charge.
    await call(
      `/orders/${id}/items/${iid}`,
      "PATCH",
      { priceCents: 500 },
      t.maya,
    );
    jordan = await view(t.jordan);
    assert.ok(jordan.mine.hold.amountCents < owed);
    assert.equal(jordan.mine.paidCents, 0);
    await call(
      `/orders/${id}/items/${iid}`,
      "PATCH",
      { shortfallDecision: "proceed" },
      t.maya,
    );
    const org = await view(t.maya);
    assert.equal(org.payouts.authorizedCents, jordan.mine.hold.amountCents);
    assert.equal((await status("shopping")).status, 200);
    jordan = await view(t.jordan);
    assert.equal(jordan.mine.hold.status, "captured");
    assert.equal(jordan.mine.paidCents, jordan.mine.hold.amountCents);
    // A price increase at the store is charged to the saved card.
    await call(
      `/orders/${id}/items/${iid}`,
      "PATCH",
      { priceCents: 1600 },
      t.maya,
    );
    jordan = await view(t.jordan);
    assert.equal(jordan.mine.dueCents, 0);
    assert.equal(
      jordan.mine.paidCents,
      jordan.myEstimateCents + jordan.myFeeCents,
    );
    // Cancelling refunds everything.
    await status("cancelled");
    assert.equal((await view(t.jordan)).mine.paidCents, 0);
  } finally {
    await h.close();
  }
});

test("payments: declined cards get 2 hours, shopping waits, then shares drop", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    await h.claim(id, t.maya);
    await h.claim(id, t.jordan);
    await h.claim(id, t.alex);
    // Alex's card will be declined when the hold is placed.
    await call(
      "/payment-method",
      "PUT",
      { brand: "Visa", last4: "0002", outcome: "declined" },
      t.alex,
    );
    const status = (s: string) =>
      call(`/orders/${id}/status`, "POST", { status: s }, t.maya);
    assert.equal((await status("locked")).status, 200);
    const alex = (await call(`/orders/${id}`, "GET", undefined, t.alex)).body;
    assert.equal(alex.mine.hold.status, "failed");
    assert.ok(alex.mine.hold.retryUntil);
    // Shopping can't start until every card is authorized.
    assert.equal((await status("shopping")).body.error.code, "HOLDS_PENDING");
    // Fixing the card re-authorizes automatically.
    await call(
      "/payment-method",
      "PUT",
      { brand: "Visa", last4: "4242", outcome: "ok" },
      t.alex,
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.alex)).body.mine.hold
        .status,
      "authorized",
    );
    // Declined again and never fixed: after 2 hours the shares drop.
    await call(
      "/payment-method",
      "PUT",
      { brand: "Visa", last4: "9995", outcome: "funds" },
      t.alex,
    );
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    await call(
      `/orders/${id}/items/${v.items[0].id}`,
      "PATCH",
      { priceCents: 1300 },
      t.maya,
    );
    assert.equal(
      (await call(`/orders/${id}`, "GET", undefined, t.alex)).body.mine.hold
        .status,
      "failed",
    );
    await runJobs(h.db, new Date(Date.now() + 2 * 3600000 + 60000));
    const after = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    assert.ok(!after.members.some((m: any) => m.userId === "demo-alex"));
  } finally {
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok',last4='4242' WHERE user_id='demo-alex'",
    );
    await h.close();
  }
});

test("organizer rules: own share, buyers needed, card before joining", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    await h.claim(id, t.maya);
    // Nobody else joined, so there's nothing to split.
    assert.equal(
      (await call(`/orders/${id}/status`, "POST", { status: "locked" }, t.maya))
        .body.error.code,
      "NO_BUYERS",
    );
    // Buyers need a saved card to confirm shares.
    await execute(
      h.db,
      "DELETE FROM payment_methods WHERE user_id='demo-priya'",
    );
    const v = (await call(`/orders/${id}`, "GET", undefined, t.priya)).body;
    const r = await call(
      `/orders/${id}/claims`,
      "PUT",
      {
        revision: v.order.revision,
        attending: true,
        claims: [{ itemId: v.items[0].id, quantity: 1 }],
      },
      t.priya,
    );
    assert.equal(r.body.error.code, "CARD_REQUIRED");
    // No weekly cap: an organizer can publish several groups back to back.
    for (let n = 0; n < 3; n++) {
      const more = await h.create();
      assert.equal(
        (await call(`/orders/${more}/publish`, "POST", {}, t.maya)).status,
        200,
      );
    }
  } finally {
    await execute(
      h.db,
      "INSERT IGNORE INTO payment_methods(user_id,brand,last4,outcome) VALUES('demo-priya','Visa','4242','ok')",
    );
    await h.close();
  }
});

test("accounts: only UVic emails can sign up or sign in", async () => {
  const h = await setup();
  try {
    const gmail = await h.call("/auth/register", "POST", {
      name: "Not UVic",
      email: `someone-${Date.now()}@gmail.com`,
      password: "long enough password",
    });
    assert.equal(gmail.status, 400);
    assert.match(JSON.stringify(gmail.body), /uvic\.ca/);
    const login = await h.call("/auth/login", "POST", {
      email: "someone@gmail.com",
      password: "whatever",
    });
    assert.equal(login.body.error.code, "UVIC_ONLY");
  } finally {
    await h.close();
  }
});
