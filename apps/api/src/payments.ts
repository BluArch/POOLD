import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import type { Payment } from "@poold/contracts";
import { verified } from "./auth.js";
import { execute, first, rows, iso, transaction, type DB } from "./db.js";
import { fail } from "./errors.js";
import { getOrder } from "./order-model.js";
import { notify } from "./notifications.js";
import { id } from "./security.js";
import type { MailSender } from "./mail.js";

/**
 * Payments are a class demo: nobody is ever charged.
 *
 * Buyers pay for their shares when they confirm them, so the organizer has the
 * money before going to the store. If shares are removed, an item turns out
 * unavailable, a price drops or the group is cancelled, the difference is
 * refunded automatically. If a price goes up, the buyer sees a small balance.
 *
 * - With STRIPE_SECRET_KEY set to a Stripe *test* key, buyers go through
 *   Stripe's hosted test checkout.
 * - Without a key, POOLD's own test checkout is used.
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

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A member's current estimate, using the same rounding as the order view. */
export async function memberEstimate(c: DB, oid: string, uid: string) {
  const r = await first(
    c,
    `SELECT COALESCE(SUM(FLOOR((i.price_cents*s.quantity + FLOOR(i.shares_per_pack/2))/i.shares_per_pack)),0) AS cents
     FROM share_claims s JOIN order_items i ON i.id=s.item_id
     WHERE i.order_id=? AND s.user_id=? AND i.available=TRUE`,
    [oid, uid],
  );
  return Number(r.cents);
}

async function netPaid(c: DB, oid: string, uid: string) {
  const r = await first(
    c,
    `SELECT COALESCE(SUM(CASE kind WHEN 'payment' THEN amount_cents ELSE -amount_cents END),0) AS cents
     FROM payments WHERE order_id=? AND user_id=?`,
    [oid, uid],
  );
  return Number(r.cents);
}

/** Payment summary for one member, shown to them and to the organizer. */
export async function ledger(
  c: DB,
  oid: string,
  uid: string,
  estimateCents: number,
): Promise<{ paidCents: number; dueCents: number; payments: Payment[] }> {
  const list = await rows(
    c,
    "SELECT * FROM payments WHERE order_id=? AND user_id=? ORDER BY created_at DESC, kind DESC",
    [oid, uid],
  );
  const paid = list.reduce(
    (n, p) => n + (p.kind === "payment" ? p.amount_cents : -p.amount_cents),
    0,
  );
  return {
    paidCents: paid,
    dueCents: Math.max(0, estimateCents - paid),
    payments: list.map((p) => ({
      id: p.id,
      kind: p.kind,
      amountCents: p.amount_cents,
      createdAt: iso(p.created_at),
      ref: p.ref,
      cardBrand: p.card_brand,
      cardLast4: p.card_last4,
      note: p.note,
    })),
  };
}

/**
 * Refund anything paid beyond what the member now owes (shares removed, item
 * unavailable, price drop, or the whole group cancelled). Test mode only.
 */
export async function settle(
  c: DB,
  o: { id: string; name: string; organizer_id: string },
  uid: string,
  reason: string,
  cancelled = false,
) {
  if (uid === o.organizer_id) return;
  const owed = cancelled ? 0 : await memberEstimate(c, o.id, uid);
  const paid = await netPaid(c, o.id, uid);
  if (paid <= owed) return;
  const refund = paid - owed;
  const last = await first(
    c,
    "SELECT mode,card_brand,card_last4 FROM payments WHERE order_id=? AND user_id=? AND kind='payment' ORDER BY created_at DESC LIMIT 1",
    [o.id, uid],
  );
  await execute(
    c,
    "INSERT INTO payments(id,order_id,user_id,kind,amount_cents,mode,ref,card_brand,card_last4,note) VALUES(?,?,?,'refund',?,?,?,?,?,?)",
    [
      id(),
      o.id,
      uid,
      refund,
      last?.mode ?? "demo",
      `re_test_${randomBytes(12).toString("hex")}`,
      last?.card_brand ?? null,
      last?.card_last4 ?? null,
      reason.slice(0, 160),
    ],
  );
  await notify(
    c,
    uid,
    o.id,
    `${o.name}: ${dollars(refund)} refunded to your card (${reason}). Test mode, no real money.`,
    `refund:${id()}`,
  );
}

/** Settle every member, e.g. after a price change or a cancellation. */
export async function settleAll(
  c: DB,
  o: { id: string; name: string; organizer_id: string },
  reason: string,
  cancelled = false,
) {
  for (const m of await rows(
    c,
    "SELECT DISTINCT user_id FROM payments WHERE order_id=?",
    [o.id],
  ))
    await settle(c, o, m.user_id, reason, cancelled);
}

/** What this member still owes right now. */
async function amountDue(db: DB, orderId: string, uid: string) {
  const o = await getOrder(db, orderId, uid);
  if (o.organizer_id === uid)
    fail(
      409,
      "ORGANIZER",
      "You’re the organizer, so your own shares come out of your shopping. There’s nothing to pay.",
    );
  if (["draft", "cancelled"].includes(o.status))
    fail(409, "NOT_PAYABLE", "This group isn’t taking payments.");
  const cents =
    (await memberEstimate(db, o.id, uid)) - (await netPaid(db, o.id, uid));
  if (cents <= 0) fail(409, "NOTHING_TO_PAY", "You’re all paid up.");
  return { o, cents };
}

async function recordPayment(
  db: Pool,
  sendMail: MailSender,
  o: any,
  user: { id: string; name: string; email: string },
  cents: number,
  mode: "stripe_test" | "demo",
  ref: string,
  card: { brand: string | null; last4: string | null },
) {
  const created = await transaction(db, async (c) => {
    // A Stripe session or demo reference is only ever counted once.
    if (await first(c, "SELECT id FROM payments WHERE ref=?", [ref]))
      return false;
    await execute(
      c,
      "INSERT INTO payments(id,order_id,user_id,kind,amount_cents,mode,ref,card_brand,card_last4) VALUES(?,?,?,'payment',?,?,?,?,?)",
      [id(), o.id, user.id, cents, mode, ref, card.brand, card.last4],
    );
    await notify(
      c,
      o.organizer_id,
      o.id,
      `${o.name}: ${user.name} paid ${dollars(cents)} for their shares (test payment).`,
      `paid:${ref}`,
    );
    return true;
  });
  if (!created) return;
  try {
    await sendMail({
      to: user.email,
      subject: `Your POOLD receipt: ${dollars(cents)} for ${o.name}`,
      text: [
        `Thanks, ${user.name.split(" ")[0]}!`,
        "",
        `You paid ${dollars(cents)} for your shares in ${o.name}.`,
        card.last4
          ? `Card: ${card.brand ?? "Card"} ending in ${card.last4}`
          : "",
        `Receipt no.: ${ref
          .replace(/^(pi|cs)_test_/, "")
          .slice(0, 12)
          .toUpperCase()}`,
        "",
        "This was a TEST payment for a class demo. No real money was charged.",
        "If shares change or an item isn't available, the difference is refunded automatically.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    });
  } catch {
    // The payment stands even if the receipt email can't be sent.
  }
}

export function payments(db: Pool, appUrl: string, sendMail: MailSender) {
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
        customer_email: req.user!.email,
        success_url: `${back}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: back,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "cad",
        "line_items[0][price_data][unit_amount]": String(cents),
        "line_items[0][price_data][product_data][name]": `Your shares in ${o.name}`,
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
    const o = await getOrder(db, req.params.id as string, req.user!.id);
    const s = await stripe(`checkout/sessions/${sessionId}`);
    if (
      s.payment_status !== "paid" ||
      s.livemode ||
      s.metadata?.order_id !== o.id ||
      s.metadata?.user_id !== req.user!.id
    )
      fail(409, "NOT_PAID", "Stripe hasn’t confirmed this payment.");
    await recordPayment(
      db,
      sendMail,
      o,
      req.user!,
      Number(s.amount_total),
      "stripe_test",
      sessionId,
      { brand: null, last4: null },
    );
    res.json({ ok: true });
  });
  // POOLD's own test checkout. Only the card brand and last four digits are
  // sent, for the receipt; the app accepts published test card numbers only.
  r.post("/orders/:id/pay/demo", verified, async (req, res) => {
    if (stripeKey())
      fail(409, "USE_STRIPE", "Use Stripe test checkout instead.");
    const card = z
      .object({
        brand: z.enum(["Visa", "Mastercard", "Amex"]).nullable().default(null),
        last4: z
          .string()
          .regex(/^\d{4}$/)
          .nullable()
          .default(null),
      })
      .parse(req.body ?? {});
    const { o, cents } = await amountDue(
      db,
      req.params.id as string,
      req.user!.id,
    );
    const ref = `pi_test_${randomBytes(12).toString("hex")}`;
    await recordPayment(db, sendMail, o, req.user!, cents, "demo", ref, card);
    res.json({ ok: true, ref, amountCents: cents });
  });
  return r;
}
