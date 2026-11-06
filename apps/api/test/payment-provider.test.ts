import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { stripeProvider, paymentProvider } from "../src/payments/provider.js";
import { createTestSetup } from "../src/payments/stripe-test.js";
import { setup, draft } from "./helpers.js";
import { first, rows, transaction } from "../src/db.js";
import { prepareClose, json } from "../src/payments/engine.js";
import { runPaymentReconciliation } from "../src/payments/reconcile.js";
test("Stripe saves a card with setup Checkout and creates an automatically captured off-session payment only at collection", async () => {
  let setups = 0,
    creates = 0;
  const intent = {
    id: "pi_sandbox",
    status: "succeeded",
    amount: 12075,
    currency: "cad",
    customer: "cus_sandbox",
    payment_method: "pm_sandbox",
    metadata: { instruction_id: "instruction" },
    latest_charge: "ch_sandbox",
    client_secret: "test_only",
  };
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: any, options: any) => {
          setups++;
          assert.equal(params.mode, "setup");
          assert.equal(params.customer, "cus_sandbox");
          assert.equal(params.payment_intent_data, undefined);
          assert.ok(options.idempotencyKey.startsWith("setup:"));
          return { id: "cs_setup", url: "https://checkout.stripe.com/test" };
        },
      },
    },
    paymentIntents: {
      create: async (params: any, options: any) => {
        creates++;
        assert.equal(params.capture_method, "automatic");
        assert.equal(params.off_session, true);
        assert.equal(params.confirm, true);
        assert.equal(params.amount, 12075);
        assert.equal(options.idempotencyKey, "charge:instruction:0");
        return intent;
      },
      retrieve: async () => intent,
    },
    charges: {
      retrieve: async () => ({
        balance_transaction: { id: "txn_sandbox", fee: 381 },
      }),
    },
  } as unknown as Stripe;
  await createTestSetup(
    stripe,
    "cus_sandbox",
    "buyer",
    1,
    "http://localhost:8081/order/test",
  );
  assert.equal(setups, 1);
  assert.equal(creates, 0);
  const op = {
    kind: "charge",
    operation_key: "charge:instruction:0",
    owner_id: "instruction",
    order_id: "group",
    request: {
      amount: 12075,
      method: {
        user_id: "buyer",
        customer_id: "cus_sandbox",
        method_id: "pm_sandbox",
      },
    },
  };
  const provider = stripeProvider(stripe),
    paid = await provider.perform(op);
  assert.equal(paid.status, "succeeded");
  assert.equal(paid.feeCents, 381);
  assert.equal(creates, 1);
  // Reconciliation retrieves the provider object instead of creating another payment.
  const again = await provider.perform({ ...op, provider_id: paid.id });
  assert.equal(again.id, paid.id);
  assert.equal(creates, 1);
});
test("unknown charge result is reconciled with the same operation before payout and never charged twice", async () => {
  const h = await setup();
  try {
    const input = draft();
    input.items[0].priceCents = 50000;
    input.deadline = new Date(Date.now() + 60000).toISOString();
    const oid = await h.create(input);
    await h.publish(oid);
    await h.claim(oid, h.tokens.maya, 1);
    await h.claim(oid, h.tokens.jordan, 2);
    await h.claim(oid, h.tokens.alex, 2);
    await h.approve(oid, h.tokens.jordan);
    await h.approve(oid, h.tokens.alex);
    const order = await first(h.db, "SELECT * FROM orders WHERE id=?", [oid]),
      cutoff = new Date(new Date(order.deadline).getTime() + 1);
    await transaction(h.db, (c) => prepareClose(c, order, cutoff));
    const base = paymentProvider(h.db, "demo", false),
      charged = new Map<string, any>();
    let timeout = true;
    const provider = {
      async perform(op: any) {
        if (op.kind !== "charge") return base.perform(op);
        if (charged.has(op.operation_key)) return charged.get(op.operation_key);
        const result = await base.perform(op);
        charged.set(op.operation_key, result);
        if (timeout) {
          timeout = false;
          throw new Error("Provider succeeded before connection timed out");
        }
        return result;
      },
    };
    await runPaymentReconciliation(h.db, false, { provider, now: cutoff });
    assert.notEqual(
      (
        await first(
          h.db,
          "SELECT status FROM funding_batches WHERE order_id=?",
          [oid],
        )
      ).status,
      "funded",
    );
    await runPaymentReconciliation(h.db, false, {
      provider,
      now: new Date(cutoff.getTime() + 31000),
    });
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
    assert.equal(charged.size, 2);
    const payments = await rows(
      h.db,
      "SELECT id FROM funding_instructions WHERE order_id=?",
      [oid],
    );
    const posted = await rows(
      h.db,
      "SELECT event_key FROM journal_entries WHERE event_key IN (?,?)",
      payments.map((i) => `scheduled:payment:${i.id}`),
    );
    assert.equal(posted.length, 2);
    assert.ok(
      (
        await rows(
          h.db,
          "SELECT request FROM funding_operations WHERE order_id=? AND kind='charge'",
          [oid],
        )
      ).every((op) => json(op.request).amount > 0),
    );
  } finally {
    await h.close();
  }
});
