import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { stripeKey } from "../src/payments.js";

test("payments: test-mode only, buyers pay after shopping, organizer sees it", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    assert.equal(v.payments, "demo");
    const iid = v.items[0].id;
    await call(
      `/orders/${id}/claims`,
      "PUT",
      { revision: 1, attending: true, claims: [{ itemId: iid, quantity: 2 }] },
      t.jordan,
    );
    // Not before the final price is known.
    assert.equal(
      (await call(`/orders/${id}/pay`, "POST", {}, t.jordan)).body.error.code,
      "NOT_READY",
    );
    const status = (s: string) =>
      call(`/orders/${id}/status`, "POST", { status: s }, t.maya);
    await status("locked");
    await call(
      `/orders/${id}/items/${iid}`,
      "PATCH",
      { shortfallDecision: "proceed" },
      t.maya,
    );
    await status("shopping");
    await call(`/orders/${id}/items/${iid}`, "PATCH", { bought: true }, t.maya);
    assert.equal((await status("ready")).status, 200);
    const due = await call(`/orders/${id}/pay`, "POST", {}, t.jordan);
    assert.equal(due.status, 200);
    assert.equal(due.body.mode, "demo");
    const member = (await call(`/orders/${id}`, "GET", undefined, t.jordan))
      .body;
    assert.equal(due.body.amountCents, member.myEstimateCents);
    assert.equal(member.mine.paidCents, null);
    // Organizer doesn't pay themself.
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.maya)).body.error
        .code,
      "ORGANIZER",
    );
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.jordan)).status,
      200,
    );
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.jordan)).body.error
        .code,
      "ALREADY_PAID",
    );
    const org = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    const jordan = org.members.find((m: any) => m.userId === "demo-jordan");
    assert.equal(jordan.paidCents, member.myEstimateCents);
    const updates = (await call("/notifications", "GET", undefined, t.maya))
      .body;
    assert.ok(updates.some((n: any) => /paid/.test(n.message)));
  } finally {
    await h.close();
  }
});

test("payments: live Stripe keys are refused", () => {
  const before = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = "sk_live_123";
    assert.throws(() => stripeKey(), /test mode/);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    assert.equal(stripeKey(), "sk_test_123");
  } finally {
    if (before === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = before;
  }
});
