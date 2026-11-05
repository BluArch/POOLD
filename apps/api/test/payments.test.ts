import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { stripeKey } from "../src/payments.js";

test("payments: buyers pay when they confirm shares, refunds follow changes", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const view = async (auth: string) =>
      (await call(`/orders/${id}`, "GET", undefined, auth)).body;
    const v = await view(t.maya);
    assert.equal(v.payments, "demo");
    const iid = v.items[0].id;
    const claim = async (quantity: number) =>
      call(
        `/orders/${id}/claims`,
        "PUT",
        {
          revision: (await view(t.jordan)).order.revision,
          attending: true,
          claims: [{ itemId: iid, quantity }],
        },
        t.jordan,
      );
    assert.equal((await claim(2)).status, 200);
    let member = await view(t.jordan);
    const owed = member.myEstimateCents;
    assert.ok(owed > 0);
    assert.equal(member.mine.dueCents, owed);
    assert.equal(member.mine.paidCents, 0);
    // Pay before shopping, so the organizer has the money.
    const due = await call(`/orders/${id}/pay`, "POST", {}, t.jordan);
    assert.equal(due.status, 200);
    assert.equal(due.body.amountCents, owed);
    const paid = await call(
      `/orders/${id}/pay/demo`,
      "POST",
      { brand: "Visa", last4: "4242" },
      t.jordan,
    );
    assert.equal(paid.status, 200);
    member = await view(t.jordan);
    assert.equal(member.mine.paidCents, owed);
    assert.equal(member.mine.dueCents, 0);
    assert.equal(member.mine.payments[0].cardLast4, "4242");
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.jordan)).body.error
        .code,
      "NOTHING_TO_PAY",
    );
    // The organizer doesn't pay themself.
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.maya)).body.error
        .code,
      "ORGANIZER",
    );
    // Organizer sees the payment and gets an update.
    const org = await view(t.maya);
    assert.equal(
      org.members.find((m: any) => m.userId === "demo-jordan").paidCents,
      owed,
    );
    const updates = (await call("/notifications", "GET", undefined, t.maya))
      .body;
    assert.ok(updates.some((n: any) => /paid/.test(n.message)));
    // Fewer shares: the difference is refunded automatically.
    await claim(1);
    member = await view(t.jordan);
    assert.equal(member.mine.paidCents, member.myEstimateCents);
    assert.equal(member.mine.payments[0].kind, "refund");
    // More shares: a balance appears and can be paid.
    await claim(2);
    member = await view(t.jordan);
    assert.ok(member.mine.dueCents > 0);
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.jordan)).status,
      200,
    );
    // Cancelling the group refunds everything.
    await call(`/orders/${id}/status`, "POST", { status: "cancelled" }, t.maya);
    member = await view(t.jordan);
    assert.equal(member.mine.paidCents, 0);
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
