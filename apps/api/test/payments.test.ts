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
    // Buyers pay their shares plus the 5% service fee.
    const owed = member.myEstimateCents + member.myFeeCents;
    assert.ok(member.myFeeCents > 0);
    assert.equal(member.myFeeCents, Math.round(member.myEstimateCents * 0.05));
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
    // Organizers pay for their own shares too, without the fee.
    const mayaClaim = await call(
      `/orders/${id}/claims`,
      "PUT",
      {
        revision: (await view(t.maya)).order.revision,
        attending: true,
        claims: [{ itemId: iid, quantity: 1 }],
      },
      t.maya,
    );
    assert.equal(mayaClaim.status, 200);
    const mine = await view(t.maya);
    assert.equal(mine.myFeeCents, 0);
    assert.equal(mine.mine.dueCents, mine.myEstimateCents);
    assert.equal(
      (await call(`/orders/${id}/pay/demo`, "POST", {}, t.maya)).status,
      200,
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
    assert.equal(
      member.mine.paidCents,
      member.myEstimateCents + member.myFeeCents,
    );
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

test("payments: unpaid shares are dropped when shares close", async () => {
  const h = await setup();
  const { call, tokens: t } = h;
  try {
    const id = await h.create();
    await h.publish(id);
    const v = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    const iid = v.items[0].id;
    for (const who of [t.jordan, t.alex])
      await call(
        `/orders/${id}/claims`,
        "PUT",
        {
          revision: v.order.revision,
          attending: true,
          claims: [{ itemId: iid, quantity: 1 }],
        },
        who,
      );
    await call(`/orders/${id}/pay/demo`, "POST", {}, t.jordan);
    await call(`/orders/${id}/status`, "POST", { status: "locked" }, t.maya);
    const after = (await call(`/orders/${id}`, "GET", undefined, t.maya)).body;
    const ids = after.members.map((m: any) => m.userId);
    assert.ok(ids.includes("demo-jordan"));
    assert.ok(!ids.includes("demo-alex"));
    const updates = (await call("/notifications", "GET", undefined, t.alex))
      .body;
    assert.ok(updates.some((n: any) => /released/.test(n.message)));
  } finally {
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
