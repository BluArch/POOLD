import test from "node:test";
import assert from "node:assert/strict";
import { setup, draft } from "./helpers.js";
import { execute, first, rows } from "../src/db.js";
import { runJobs } from "../src/jobs.js";
import { runPaymentReconciliation } from "../src/payments/reconcile.js";
async function group(h: Awaited<ReturnType<typeof setup>>) {
  const input = draft();
  input.items[0].priceCents = 50000;
  const oid = await h.create(input);
  await h.publish(oid);
  await h.claim(oid, h.tokens.maya, 1);
  await h.claim(oid, h.tokens.jordan, 2);
  await h.claim(oid, h.tokens.alex, 2);
  return oid;
}
test("approval is exact, every saved edit revokes it, and open groups never charge or close early", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await h.approve(oid, h.tokens.jordan);
    await h.approve(oid, h.tokens.alex);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/payment-status`,
          "GET",
          undefined,
          h.tokens.jordan,
        )
      ).body.approval,
      "approved",
    );
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/status`,
          "POST",
          { status: "locked" },
          h.tokens.maya,
        )
      ).body.error.code,
      "BEFORE_APPROVED_CUTOFF",
    );
    await runPaymentReconciliation(h.db, false);
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT id FROM funding_instructions WHERE order_id=?",
          [oid],
        )
      ).length,
      0,
    );
    await h.claim(oid, h.tokens.jordan, 2);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/payment-status`,
          "GET",
          undefined,
          h.tokens.jordan,
        )
      ).body.approval,
      "changes_need_approval",
    );
    const v = (await h.call(`/orders/${oid}`, "GET", undefined, h.tokens.maya))
      .body;
    await runJobs(h.db, new Date(Date.parse(v.order.deadline) + 1));
    assert.equal(
      (
        await first(
          h.db,
          "SELECT status FROM funding_batches WHERE order_id=?",
          [oid],
        )
      ).status,
      "approval_needed",
    );
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT id FROM funding_instructions WHERE order_id=?",
          [oid],
        )
      ).length,
      0,
    );
  } finally {
    await h.close();
  }
});
test("closure charges once, funds groceries before shopping and retains the frozen completion reward", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await h.closeFunding(oid);
    const b = await first(
      h.db,
      "SELECT * FROM funding_batches WHERE order_id=?",
      [oid],
    );
    assert.equal(b.status, "funded");
    assert.equal(b.grocery_cents, 40000);
    assert.equal(b.reward_cents, 5000);
    const payments = await rows(
      h.db,
      "SELECT * FROM funding_instructions WHERE order_id=?",
      [oid],
    );
    assert.equal(payments.length, 2);
    assert.ok(payments.every((p) => p.status === "paid"));
    assert.equal(
      (
        await rows(h.db, "SELECT * FROM funding_payouts WHERE order_id=?", [
          oid,
        ])
      ).length,
      1,
    );
    await runPaymentReconciliation(h.db, false);
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT * FROM funding_instructions WHERE order_id=?",
          [oid],
        )
      ).length,
      2,
    );
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/status`,
          "POST",
          { status: "shopping" },
          h.tokens.maya,
        )
      ).status,
      200,
    );
    const item = (
      await h.call(`/orders/${oid}`, "GET", undefined, h.tokens.maya)
    ).body.items[0];
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/items/${item.id}`,
          "PATCH",
          { priceCents: 60000 },
          h.tokens.maya,
        )
      ).body.error.code,
      "SUPPLEMENT_APPROVAL_REQUIRED",
    );
    await h.call(
      `/orders/${oid}/items/${item.id}`,
      "PATCH",
      { priceCents: 45000 },
      h.tokens.maya,
    );
    await runPaymentReconciliation(h.db, false);
    assert.equal(
      (
        await first(
          h.db,
          "SELECT reward_cents FROM funding_batches WHERE order_id=?",
          [oid],
        )
      ).reward_cents,
      5000,
    );
    assert.ok(
      (
        await first(
          h.db,
          "SELECT SUM(refunded_cents) AS n FROM funding_instructions WHERE order_id=?",
          [oid],
        )
      ).n > 0,
    );
  } finally {
    await h.close();
  }
});
test("failed buyer can retry, then all members are notified and another buyer voluntarily takes shares", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='declined' WHERE user_id='demo-alex'",
    );
    await h.closeFunding(oid);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/status`,
          "POST",
          { status: "shopping" },
          h.tokens.maya,
        )
      ).body.error.code,
      "SHOPPING_NOT_FUNDED",
    );
    const batch = await first(
      h.db,
      "SELECT * FROM funding_batches WHERE order_id=?",
      [oid],
    );
    await runPaymentReconciliation(h.db, false, {
      now: new Date(new Date(batch.retry_until).getTime() + 1),
    });
    const notices = await rows(
      h.db,
      "SELECT user_id FROM notifications WHERE order_id=? AND event_key=?",
      [oid, `takeover-open:${oid}`],
    );
    assert.deepEqual(notices.map((n) => n.user_id).sort(), [
      "demo-alex",
      "demo-jordan",
      "demo-maya",
    ]);
    const offers = (
      await h.call(
        `/orders/${oid}/payment-status`,
        "GET",
        undefined,
        h.tokens.jordan,
      )
    ).body.offers;
    assert.equal(offers.length, 1);
    const before = await first(
      h.db,
      "SELECT total_cents FROM funding_instructions WHERE order_id=? AND member_id='demo-jordan' AND purpose='initial'",
      [oid],
    );
    const q = (
      await h.call(
        `/orders/${oid}/takeover-quote`,
        "POST",
        { offerId: offers[0].id, quantity: 2 },
        h.tokens.jordan,
      )
    ).body;
    const claim = () =>
      h.call(
        `/orders/${oid}/takeover-claim`,
        "POST",
        {
          offerId: offers[0].id,
          quantity: 2,
          fingerprint: q.fingerprint,
          amountCents: q.amountCents,
          agreed: true,
        },
        h.tokens.jordan,
      );
    assert.equal((await claim()).status, 200);
    assert.equal((await claim()).status, 409);
    const after = await first(
      h.db,
      "SELECT total_cents FROM funding_instructions WHERE order_id=? AND member_id='demo-jordan' AND purpose='initial'",
      [oid],
    );
    assert.equal(after.total_cents, before.total_cents);
    assert.equal(
      (
        await first(
          h.db,
          "SELECT status FROM funding_batches WHERE order_id=?",
          [oid],
        )
      ).status,
      "funded",
    );
    assert.equal(
      (
        await first(
          h.db,
          "SELECT SUM(total_cents-refunded_cents) AS n FROM funding_instructions WHERE order_id=? AND member_id='demo-alex' AND status='paid'",
          [oid],
        )
      ).n,
      null,
    );
  } finally {
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id='demo-alex'",
    );
    await h.close();
  }
});
test("organizer can cancel during recovery; successful payments are refunded once", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='funds' WHERE user_id='demo-alex'",
    );
    await h.closeFunding(oid);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/status`,
          "POST",
          { status: "cancelled" },
          h.tokens.maya,
        )
      ).status,
      200,
    );
    await runPaymentReconciliation(h.db, false);
    const list = await rows(
      h.db,
      "SELECT * FROM funding_instructions WHERE order_id=?",
      [oid],
    );
    assert.ok(
      list.every(
        (i) => i.status === "superseded" || i.refunded_cents === i.total_cents,
      ),
    );
    const count = (
      await rows(
        h.db,
        "SELECT * FROM funding_operations WHERE order_id=? AND kind='refund'",
        [oid],
      )
    ).length;
    await runPaymentReconciliation(h.db, false);
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT * FROM funding_operations WHERE order_id=? AND kind='refund'",
          [oid],
        )
      ).length,
      count,
    );
  } finally {
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id='demo-alex'",
    );
    await h.close();
  }
});
test("buyer explicitly retries a corrected card without automatic extra charges or takeover", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='declined' WHERE user_id='demo-alex'",
    );
    await h.closeFunding(oid);
    await h.call(
      "/payment-method",
      "PUT",
      { brand: "Visa", last4: "4242", outcome: "ok" },
      h.tokens.alex,
    );
    const retry = (
      await h.call(
        `/orders/${oid}/payment-status`,
        "GET",
        undefined,
        h.tokens.alex,
      )
    ).body.retry;
    assert.ok(retry);
    const response = await h.call(
      `/orders/${oid}/payment-retry`,
      "POST",
      {
        fingerprint: retry.fingerprint,
        amountCents: retry.amountCents,
        agreed: true,
      },
      h.tokens.alex,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "funded");
    assert.equal(
      (await rows(h.db, "SELECT * FROM funding_shares WHERE order_id=?", [oid]))
        .length,
      0,
    );
  } finally {
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id='demo-alex'",
    );
    await h.close();
  }
});
test("organizer takeover excludes own groceries, requires confirmation of revised reward and cannot force underfunded shopping", async () => {
  const h = await setup();
  try {
    const input = draft();
    input.items[0].priceCents = 100000;
    const oid = await h.create(input);
    await h.publish(oid);
    await h.claim(oid, h.tokens.maya, 1);
    await h.claim(oid, h.tokens.jordan, 3);
    await h.claim(oid, h.tokens.alex, 1);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='funds' WHERE user_id='demo-alex'",
    );
    await h.closeFunding(oid);
    const b = await first(
      h.db,
      "SELECT * FROM funding_batches WHERE order_id=?",
      [oid],
    );
    await runPaymentReconciliation(h.db, false, {
      now: new Date(new Date(b.retry_until).getTime() + 1),
    });
    const offer = (
      await h.call(
        `/orders/${oid}/payment-status`,
        "GET",
        undefined,
        h.tokens.maya,
      )
    ).body.offers[0];
    const q = (
      await h.call(
        `/orders/${oid}/takeover-quote`,
        "POST",
        { offerId: offer.id, quantity: 1 },
        h.tokens.maya,
      )
    ).body;
    assert.equal(q.organizerOwned, true);
    assert.equal(q.amountCents, 20000);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/takeover-claim`,
          "POST",
          {
            offerId: offer.id,
            quantity: 1,
            fingerprint: q.fingerprint,
            amountCents: q.amountCents,
            agreed: true,
          },
          h.tokens.maya,
        )
      ).status,
      200,
    );
    const state = (
      await h.call(
        `/orders/${oid}/payment-status`,
        "GET",
        undefined,
        h.tokens.maya,
      )
    ).body;
    assert.equal(state.organizer.groceryCents, 60000);
    assert.equal(state.organizer.rewardCents, 6000);
    assert.equal(state.organizer.confirmationNeeded, true);
    assert.notEqual(state.status, "funded");
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/funding-confirm`,
          "POST",
          { ...state.organizer, agreed: true },
          h.tokens.maya,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await first(
          h.db,
          "SELECT status FROM funding_batches WHERE order_id=?",
          [oid],
        )
      ).status,
      "funded",
    );
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT * FROM funding_instructions WHERE order_id=? AND member_id='demo-maya'",
          [oid],
        )
      ).length,
      0,
    );
  } finally {
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id='demo-alex'",
    );
    await h.close();
  }
});
test("higher store prices require separate explicit approvals and extra funding before buying", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await h.closeFunding(oid);
    await h.call(
      `/orders/${oid}/status`,
      "POST",
      { status: "shopping" },
      h.tokens.maya,
    );
    const item = (
      await h.call(`/orders/${oid}`, "GET", undefined, h.tokens.maya)
    ).body.items[0];
    const proposal = await h.call(
      `/orders/${oid}/supplement-propose`,
      "POST",
      { itemId: item.id, priceCents: 60000 },
      h.tokens.maya,
    );
    assert.equal(proposal.status, 200);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/items/${item.id}`,
          "PATCH",
          { bought: true },
          h.tokens.maya,
        )
      ).body.error.code,
      "SUPPLEMENT_NOT_FUNDED",
    );
    for (const auth of [h.tokens.jordan, h.tokens.alex]) {
      const q = (
        await h.call(`/orders/${oid}/payment-status`, "GET", undefined, auth)
      ).body.supplements[0];
      assert.ok(q);
      assert.equal(
        (
          await h.call(
            `/orders/${oid}/supplement-approve`,
            "POST",
            {
              supplementId: q.id,
              fingerprint: q.fingerprint,
              amountCents: q.amountCents,
              agreed: true,
            },
            auth,
          )
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await first(h.db, "SELECT price_cents FROM order_items WHERE id=?", [
          item.id,
        ])
      ).price_cents,
      60000,
    );
    assert.equal(
      (
        await first(
          h.db,
          "SELECT reward_cents FROM funding_batches WHERE order_id=?",
          [oid],
        )
      ).reward_cents,
      5000,
    );
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/items/${item.id}`,
          "PATCH",
          { bought: true },
          h.tokens.maya,
        )
      ).status,
      200,
    );
  } finally {
    await h.close();
  }
});
test("canceling after grocery bank payout records the advance and never spends other groups funds to reverse it", async () => {
  const h = await setup();
  try {
    const oid = await group(h);
    await h.closeFunding(oid);
    assert.equal(
      (
        await h.call(
          `/orders/${oid}/status`,
          "POST",
          { status: "cancelled" },
          h.tokens.maya,
        )
      ).status,
      200,
    );
    const recovery = await first(
      h.db,
      "SELECT * FROM funding_advance_recoveries WHERE order_id=?",
      [oid],
    );
    assert.equal(recovery.amount_cents, 40000);
    assert.equal(recovery.status, "due");
    const nextRun = await group(h);
    await h.closeFunding(nextRun);
    assert.equal(
      (
        await first(
          h.db,
          "SELECT status FROM funding_batches WHERE order_id=?",
          [nextRun],
        )
      ).status,
      "approval_needed",
    );
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT id FROM funding_instructions WHERE order_id=?",
          [nextRun],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await rows(
          h.db,
          "SELECT * FROM funding_operations WHERE order_id=? AND kind='reversal'",
          [oid],
        )
      ).length,
      0,
    );
  } finally {
    await h.close();
  }
});
test("out-of-order failed takeover release preserves the exact original component cents", async () => {
  const h = await setup();
  try {
    const input = draft();
    input.items[0].priceCents = 50001;
    const oid = await h.create(input);
    await h.publish(oid);
    await h.claim(oid, h.tokens.maya, 1);
    await h.claim(oid, h.tokens.jordan, 2);
    await h.claim(oid, h.tokens.alex, 2);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='declined' WHERE user_id='demo-alex'",
    );
    await h.closeFunding(oid);
    const b = await first(
      h.db,
      "SELECT * FROM funding_batches WHERE order_id=?",
      [oid],
    );
    await runPaymentReconciliation(h.db, false, {
      now: new Date(new Date(b.retry_until).getTime() + 1),
    });
    const offer = (
      await h.call(
        `/orders/${oid}/payment-status`,
        "GET",
        undefined,
        h.tokens.jordan,
      )
    ).body.offers[0];
    const claim = async (auth: string) => {
      const q = (
        await h.call(
          `/orders/${oid}/takeover-quote`,
          "POST",
          { offerId: offer.id, quantity: 1 },
          auth,
        )
      ).body;
      const r = await h.call(
        `/orders/${oid}/takeover-claim`,
        "POST",
        {
          offerId: offer.id,
          quantity: 1,
          fingerprint: q.fingerprint,
          amountCents: q.amountCents,
          agreed: true,
        },
        auth,
      );
      assert.equal(r.status, 200);
      return q;
    };
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='declined' WHERE user_id='demo-jordan'",
    );
    const failedQuote = await claim(h.tokens.jordan);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id='demo-alex'",
    );
    await claim(h.tokens.alex);
    await execute(
      h.db,
      "UPDATE funding_instructions SET attempts=3 WHERE order_id=? AND purpose='takeover' AND status='failed'",
      [oid],
    );
    await runPaymentReconciliation(h.db, false);
    const restored = (
      await h.call(
        `/orders/${oid}/takeover-quote`,
        "POST",
        { offerId: offer.id, quantity: 1 },
        h.tokens.jordan,
      )
    ).body;
    assert.equal(restored.groceryCents, failedQuote.groceryCents);
    assert.equal(restored.amountCents, failedQuote.amountCents);
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id='demo-jordan'",
    );
    await claim(h.tokens.jordan);
    const paid = await first(
      h.db,
      "SELECT SUM(grocery_cents) AS n FROM funding_instructions WHERE order_id=? AND status='paid'",
      [oid],
    );
    assert.equal(Number(paid.n), 40001);
  } finally {
    await execute(
      h.db,
      "UPDATE payment_methods SET outcome='ok' WHERE user_id IN('demo-alex','demo-jordan')",
    );
    await h.close();
  }
});
