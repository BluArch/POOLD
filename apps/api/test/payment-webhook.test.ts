import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { setup } from "./helpers.js";
import { createApp } from "../src/app.js";
import { execute, rows } from "../src/db.js";
import { id } from "../src/security.js";

test("signed Stripe events enter the durable inbox once; forged and live events fail", async () => {
  const previous = { mode: process.env.PAYMENTS_TEST_MODE, key: process.env.STRIPE_SECRET_KEY,
    secret: process.env.STRIPE_WEBHOOK_SECRET };
  process.env.PAYMENTS_TEST_MODE = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const h = await setup();
  const server = createApp(h.db, { production: false, demo: true, sendMail: async () => {} }).listen(0);
  const productionServer = createApp(h.db, { production: true, demo: false, otpSecret: "test-only-secret", sendMail: async () => {} }).listen(0);
  const eventId = `evt_${id()}`;
  try {
    const stripe = new Stripe("sk_test_fake");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/stripe/webhook`;
    const payload = JSON.stringify({ id: eventId, object: "event", api_version: "2026-10-28.endive",
      type: "payment_intent.amount_capturable_updated", livemode: false,
      data: { object: { id: "pi_test_123", object: "payment_intent" } } });
    const send = (signature: string, body = payload) => fetch(base, { method: "POST", body,
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature } });
    assert.equal((await send("bad")).status, 400);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    assert.equal((await send(signature)).status, 200);
    assert.equal((await send(signature)).status, 200);
    assert.equal((await rows(h.db, "SELECT stripe_event_id FROM stripe_events WHERE stripe_event_id=?", [eventId])).length, 1);
    const livePayload = payload.replace('"livemode":false', '"livemode":true');
    const liveSignature = stripe.webhooks.generateTestHeaderString({ payload: livePayload, secret: "whsec_test" });
    assert.equal((await send(liveSignature, livePayload)).status, 400);
    const productionUrl = `http://127.0.0.1:${(productionServer.address() as { port: number }).port}/api/stripe/webhook`;
    assert.equal((await fetch(productionUrl, { method: "POST", body: payload,
      headers: { "Content-Type": "application/json", "Stripe-Signature": signature } })).status, 503);
  } finally {
    await execute(h.db, "DELETE FROM stripe_events WHERE stripe_event_id=?", [eventId]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => productionServer.close(() => resolve()));
    await h.close();
    for (const [key, value] of Object.entries({ PAYMENTS_TEST_MODE: previous.mode,
      STRIPE_SECRET_KEY: previous.key, STRIPE_WEBHOOK_SECRET: previous.secret })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
