import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { verified } from "./auth.js";
import { execute, first } from "./db.js";
import { fail } from "./errors.js";
import { getOrder, orderView } from "./order-model.js";
import { notify } from "./notifications.js";

/**
 * Payments are a class demo: nobody is ever charged.
 * - With STRIPE_SECRET_KEY set to a Stripe *test* key, buyers go through real
 *   Stripe Checkout pages and pay with test cards (4242 4242 4242 4242).
 * - Without a key, a built-in "test payment" screen marks the share as paid.
 * Live keys are refused so real money can't move by accident.
 */
export function stripeKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!/^(sk|rk)_test_/.test(key))
    throw new Error(
      "POOLD only supports Stripe test mode. Use a key that starts with sk_test_.",
    );
  return key;
}

async function stripe(
  path: string,
  init: { method?: string; form?: Record<string, string> } = {},
) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      ...(init.form
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  const body = (await r.json()) as any;
  if (!r.ok)
    fail(
      502,
      "STRIPE",
      body?.error?.message ?? "Stripe test checkout is unavailable.",
    );
  return body;
}

/** What this member owes, worked out from final prices after shopping. */
async function amountDue(db: Pool, orderId: string, uid: string) {
  const o = await getOrder(db, orderId, uid);
  if (o.organizer_id === uid)
    fail(409, "ORGANIZER", "Organizers don’t pay for their own shares.");
  if (!["ready", "completed"].includes(o.status))
    fail(
      409,
      "NOT_READY",
      "You can pay once the organizer has finished shopping.",
    );
  const view = await orderView(db, o, uid);
  if (!view.mine || view.myEstimateCents <= 0)
    fail(409, "NOTHING_TO_PAY", "You have nothing to pay for in this group.");
  if (view.mine.paidCents !== null)
    fail(409, "ALREADY_PAID", "You’ve already paid.");
  return { o, cents: view.myEstimateCents };
}

async function markPaid(
  db: Pool,
  o: any,
  uid: string,
  cents: number,
  mode: "stripe_test" | "demo",
  ref: string | null,
) {
  const result = await execute(
    db,
    "UPDATE memberships SET paid_cents=?,paid_at=UTC_TIMESTAMP(3),payment_mode=?,payment_ref=? WHERE order_id=? AND user_id=? AND paid_cents IS NULL",
    [cents, mode, ref, o.id, uid],
  );
  if ((result as any).affectedRows) {
    const u = await first(db, "SELECT name FROM users WHERE id=?", [uid]);
    await notify(
      db,
      o.organizer_id,
      o.id,
      `${o.name}: ${u?.name ?? "A member"} paid $${(cents / 100).toFixed(2)} (test payment).`,
      `paid:${o.id}:${uid}`,
    );
  }
}

export function payments(db: Pool, appUrl: string) {
  const r = Router();
  r.post("/orders/:id/pay", verified, async (req, res) => {
    const { o, cents } = await amountDue(
      db,
      req.params.id as string,
      req.user!.id,
    );
    if (!stripeKey()) {
      res.json({ mode: "demo", amountCents: cents });
      return;
    }
    // Send buyers back to the address they paid from (laptop, Wi-Fi or tunnel
    // link). The API's origin check has already approved this address.
    const from = req.get("origin") ?? appUrl;
    const back = `${from.replace(/\/$/, "")}/order/${o.id}`;
    const session = await stripe("checkout/sessions", {
      method: "POST",
      form: {
        mode: "payment",
        success_url: `${back}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: back,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "cad",
        "line_items[0][price_data][unit_amount]": String(cents),
        "line_items[0][price_data][product_data][name]": `Your share of ${o.name}`,
        "metadata[order_id]": o.id,
        "metadata[user_id]": req.user!.id,
        "metadata[amount_cents]": String(cents),
        client_reference_id: `${o.id}:${req.user!.id}`,
      },
    });
    res.json({ mode: "stripe_test", amountCents: cents, url: session.url });
  });
  // Called when Stripe sends the buyer back. We ask Stripe directly whether the
  // session was paid, so this works on a laptop without webhooks.
  r.post("/orders/:id/pay/confirm", verified, async (req, res) => {
    const sessionId = z
      .string()
      .regex(/^cs_test_[A-Za-z0-9_]+$/)
      .parse(req.body.sessionId);
    if (!stripeKey())
      fail(409, "NO_STRIPE", "Stripe isn’t set up on this server.");
    const { o, cents } = await amountDue(
      db,
      req.params.id as string,
      req.user!.id,
    );
    const s = await stripe(`checkout/sessions/${sessionId}`);
    if (
      s.payment_status !== "paid" ||
      s.livemode ||
      s.metadata?.order_id !== o.id ||
      s.metadata?.user_id !== req.user!.id ||
      Number(s.amount_total) !== cents
    )
      fail(409, "NOT_PAID", "Stripe hasn’t confirmed this payment.");
    await markPaid(db, o, req.user!.id, cents, "stripe_test", sessionId);
    res.json({ ok: true });
  });
  // Built-in test payment for when no Stripe key is configured.
  r.post("/orders/:id/pay/demo", verified, async (req, res) => {
    if (stripeKey())
      fail(409, "USE_STRIPE", "Use Stripe test checkout instead.");
    const { o, cents } = await amountDue(
      db,
      req.params.id as string,
      req.user!.id,
    );
    await markPaid(db, o, req.user!.id, cents, "demo", null);
    res.json({ ok: true });
  });
  return r;
}
