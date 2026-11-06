import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import {
  feeFor,
  shareCost,
  withMarkup,
  organizerReward,
  type Payment,
  type PayoutSummary,
  type Hold,
  type SavedCard,
} from "@poold/contracts";
import { requireUser, verified } from "./auth.js";
import { execute, first, rows, iso, transaction, type DB } from "./db.js";
import { notify } from "./notifications.js";
import { id } from "./security.js";

/**
 * Test-mode payments for the class demo. Nobody is ever charged.
 *
 * How money moves (like a hotel or a gas pump):
 * 1. Confirming shares saves a card. Nothing is charged, so buyers can change
 *    their minds freely while the group is open.
 * 2. When shares close, a hold is placed on each buyer's card for their shares
 *    (Costco price + 15% markup) plus the 5% service fee. A declined card gets 2 hours to be fixed;
 *    shopping can't start until every hold is authorized or the shares drop.
 * 3. When the organizer starts shopping, the holds are charged and the
 *    Costco cost of buyers' shares is released to them. After hand-out they
 *    earn max($30, 10% of that cost); POOLD keeps the rest.
 * 4. Store price differences afterwards are refunded, or charged to the saved
 *    card if a price went up.
 * Organizers don't pay through the app: they pay for their own share at the
 * store.
 */

export const RETRY_MS = 2 * 3600000;
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
type O = { id: string; name: string; organizer_id: string };

/** A member's shares, per item line, using the same rounding as the order view. */
async function memberLines(c: DB, oid: string, uid: string) {
  return (
    await rows(
      c,
      `SELECT i.price_cents,i.shares_per_pack,s.quantity
       FROM share_claims s JOIN order_items i ON i.id=s.item_id
       WHERE i.order_id=? AND s.user_id=? AND i.available=TRUE`,
      [oid, uid],
    )
  ).map((l) => shareCost(l.price_cents, l.quantity, l.shares_per_pack));
}

/** Costco cost of a member's shares (what the organizer spends on them). */
export async function memberCost(c: DB, oid: string, uid: string) {
  return (await memberLines(c, oid, uid)).reduce((n, x) => n + x, 0);
}

/** A buyer's share price: Costco cost + 15% markup, per item line. */
export async function memberEstimate(c: DB, oid: string, uid: string) {
  return (await memberLines(c, oid, uid)).reduce(
    (n, x) => n + withMarkup(x),
    0,
  );
}

/** What a member pays through the app: shares + 5% fee. Organizers: 0. */
export async function memberOwed(
  c: DB,
  o: { id: string; organizer_id: string },
  uid: string,
) {
  if (uid === o.organizer_id) return 0;
  const shares = await memberEstimate(c, o.id, uid);
  return shares + feeFor(shares);
}

/** Costco cost of every buyer's shares (the organizer's own share excluded). */
async function groceryCost(c: DB, o: { id: string; organizer_id: string }) {
  let cents = 0;
  for (const m of await rows(
    c,
    "SELECT user_id FROM memberships WHERE order_id=? AND user_id<>?",
    [o.id, o.organizer_id],
  ))
    cents += await memberCost(c, o.id, m.user_id);
  return cents;
}

export async function netPaid(c: DB, oid: string, uid: string) {
  const r = await first(
    c,
    `SELECT COALESCE(SUM(CASE kind WHEN 'payment' THEN amount_cents ELSE -amount_cents END),0) AS cents
     FROM payments WHERE order_id=? AND user_id=?`,
    [oid, uid],
  );
  return Number(r.cents);
}

async function savedCard(c: DB, uid: string) {
  return first(c, "SELECT * FROM payment_methods WHERE user_id=?", [uid]);
}

/** Payment summary for one member, shown to them and to the organizer. */
export async function ledger(
  c: DB,
  oid: string,
  uid: string,
  estimateCents: number,
  organizer = false,
): Promise<{
  paidCents: number;
  dueCents: number;
  feeCents: number;
  payments: Payment[];
  hold: Hold | null;
}> {
  const fee = feeFor(estimateCents, organizer);
  const list = await rows(
    c,
    "SELECT * FROM payments WHERE order_id=? AND user_id=? ORDER BY created_at DESC, kind DESC",
    [oid, uid],
  );
  const paid = list.reduce(
    (n, p) => n + (p.kind === "payment" ? p.amount_cents : -p.amount_cents),
    0,
  );
  const h = await first(
    c,
    "SELECT * FROM holds WHERE order_id=? AND user_id=?",
    [oid, uid],
  );
  return {
    paidCents: paid,
    feeCents: fee,
    dueCents: organizer ? 0 : Math.max(0, estimateCents + fee - paid),
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
    hold: h
      ? {
          status: h.status,
          amountCents: h.amount_cents,
          cardBrand: h.card_brand,
          cardLast4: h.card_last4,
          reason: h.reason,
          retryUntil: h.retry_until ? iso(h.retry_until) : null,
        }
      : null,
  };
}

/**
 * Place (or update) the hold for one buyer. A missing or declined card marks
 * the hold failed with a 2-hour window to fix it.
 */
export async function authorize(c: DB, o: O, uid: string) {
  if (uid === o.organizer_id) return "skip";
  const amount = await memberOwed(c, o, uid);
  const existing = await first(
    c,
    "SELECT * FROM holds WHERE order_id=? AND user_id=? FOR UPDATE",
    [o.id, uid],
  );
  if (existing?.status === "captured") return "captured";
  if (amount <= 0) {
    if (existing)
      await execute(
        c,
        "UPDATE holds SET status='released',amount_cents=0 WHERE order_id=? AND user_id=?",
        [o.id, uid],
      );
    return "released";
  }
  const card = await savedCard(c, uid);
  if (card?.outcome === "ok") {
    await execute(
      c,
      `INSERT INTO holds(order_id,user_id,amount_cents,status,card_brand,card_last4,reason,retry_until)
       VALUES(?,?,?,'authorized',?,?,NULL,NULL)
       ON DUPLICATE KEY UPDATE amount_cents=VALUES(amount_cents),status='authorized',card_brand=VALUES(card_brand),card_last4=VALUES(card_last4),reason=NULL,retry_until=NULL`,
      [o.id, uid, amount, card.brand, card.last4],
    );
    if (existing?.status === "failed")
      await notify(
        c,
        o.organizer_id,
        o.id,
        `${o.name}: a buyer fixed their card. Their ${dollars(amount)} is authorized.`,
        `hold-fixed:${o.id}:${uid}:${id()}`,
      );
    return "authorized";
  }
  const reason = !card
    ? "No card saved"
    : card.outcome === "funds"
      ? "Insufficient funds"
      : "Card declined";
  const until =
    existing?.status === "failed" && existing.retry_until
      ? new Date(existing.retry_until)
      : new Date(Date.now() + RETRY_MS);
  await execute(
    c,
    `INSERT INTO holds(order_id,user_id,amount_cents,status,card_brand,card_last4,reason,retry_until)
     VALUES(?,?,?,'failed',?,?,?,?)
     ON DUPLICATE KEY UPDATE amount_cents=VALUES(amount_cents),status='failed',card_brand=VALUES(card_brand),card_last4=VALUES(card_last4),reason=VALUES(reason),retry_until=VALUES(retry_until)`,
    [
      o.id,
      uid,
      amount,
      card?.brand ?? null,
      card?.last4 ?? null,
      reason,
      until,
    ],
  );
  if (existing?.status !== "failed")
    await notify(
      c,
      uid,
      o.id,
      `${o.name}: we couldn’t hold ${dollars(amount)} on your card (${reason.toLowerCase()}). Update your card within 2 hours or your shares will be released.`,
      `hold-failed:${o.id}:${uid}:${id()}`,
    );
  return "failed";
}

/** When shares close: hold every buyer's shares + fee on their saved card. */
export async function placeHolds(c: DB, o: O) {
  const buyers = await rows(
    c,
    "SELECT DISTINCT s.user_id FROM share_claims s JOIN order_items i ON i.id=s.item_id WHERE i.order_id=? AND s.user_id<>?",
    [o.id, o.organizer_id],
  );
  for (const b of buyers) await authorize(c, o, b.user_id);
}

/** Buyers whose card is still declined after the 2-hour window lose their shares. */
export async function dropFailedHolds(c: DB, o: O, now = new Date()) {
  const expired = await rows(
    c,
    "SELECT user_id FROM holds WHERE order_id=? AND status='failed' AND retry_until<=?",
    [o.id, now],
  );
  for (const h of expired) {
    await execute(
      c,
      "DELETE s FROM share_claims s JOIN order_items i ON i.id=s.item_id WHERE i.order_id=? AND s.user_id=?",
      [o.id, h.user_id],
    );
    await execute(c, "DELETE FROM memberships WHERE order_id=? AND user_id=?", [
      o.id,
      h.user_id,
    ]);
    await execute(
      c,
      "UPDATE holds SET status='released',amount_cents=0 WHERE order_id=? AND user_id=?",
      [o.id, h.user_id],
    );
    await notify(
      c,
      h.user_id,
      o.id,
      `${o.name}: your card wasn’t updated in time, so your shares were released. Nothing was charged.`,
      `hold-drop:${o.id}:${h.user_id}`,
    );
    await notify(
      c,
      o.organizer_id,
      o.id,
      `${o.name}: a buyer’s card was still declined after 2 hours, so their shares were released. Check the shopping list.`,
      `hold-drop-org:${o.id}:${h.user_id}`,
    );
  }
  return expired.length;
}

/** Holds still waiting on a buyer to fix their card. */
export async function failedHolds(c: DB, oid: string) {
  return rows(
    c,
    "SELECT user_id,retry_until FROM holds WHERE order_id=? AND status='failed' ORDER BY retry_until",
    [oid],
  );
}

async function charge(
  c: DB,
  o: O,
  uid: string,
  cents: number,
  card: { brand: string | null; last4: string | null },
  note: string | null,
) {
  await execute(
    c,
    "INSERT INTO payments(id,order_id,user_id,kind,amount_cents,mode,ref,card_brand,card_last4,note) VALUES(?,?,?,'payment',?,'demo',?,?,?,?)",
    [
      id(),
      o.id,
      uid,
      cents,
      `pi_test_${randomBytes(12).toString("hex")}`,
      card.brand,
      card.last4,
      note,
    ],
  );
}

/** Shopping starts: charge every authorized hold. */
export async function captureHolds(c: DB, o: O) {
  const holds = await rows(
    c,
    "SELECT * FROM holds WHERE order_id=? AND status='authorized' FOR UPDATE",
    [o.id],
  );
  for (const h of holds) {
    await charge(
      c,
      o,
      h.user_id,
      h.amount_cents,
      { brand: h.card_brand, last4: h.card_last4 },
      null,
    );
    await execute(
      c,
      "UPDATE holds SET status='captured' WHERE order_id=? AND user_id=?",
      [o.id, h.user_id],
    );
    await notify(
      c,
      h.user_id,
      o.id,
      `${o.name}: shopping started, so ${dollars(h.amount_cents)} was charged to your ${h.card_brand ?? "card"} •••• ${h.card_last4 ?? ""} (test).`,
      `captured:${o.id}:${h.user_id}`,
    );
  }
}

/**
 * Keep a buyer's money in line with what they owe:
 * - before shopping, update the hold (no charge);
 * - after shopping started, refund overpayments or charge price increases
 *   to the saved card;
 * - cancelled: release the hold and refund anything charged.
 */
export async function settle(
  c: DB,
  o: O & { status?: string },
  uid: string,
  reason: string,
  cancelled = false,
) {
  if (uid === o.organizer_id) return;
  const hold = await first(
    c,
    "SELECT * FROM holds WHERE order_id=? AND user_id=?",
    [o.id, uid],
  );
  if (cancelled && hold && hold.status !== "captured")
    await execute(
      c,
      "UPDATE holds SET status='released' WHERE order_id=? AND user_id=?",
      [o.id, uid],
    );
  if (!cancelled && hold && ["authorized", "failed"].includes(hold.status)) {
    await authorize(c, o, uid);
    return;
  }
  const owed = cancelled ? 0 : await memberOwed(c, o, uid);
  const paid = await netPaid(c, o.id, uid);
  if (paid > owed) {
    const refund = paid - owed;
    const last = await first(
      c,
      "SELECT card_brand,card_last4 FROM payments WHERE order_id=? AND user_id=? AND kind='payment' ORDER BY created_at DESC LIMIT 1",
      [o.id, uid],
    );
    await execute(
      c,
      "INSERT INTO payments(id,order_id,user_id,kind,amount_cents,mode,ref,card_brand,card_last4,note) VALUES(?,?,?,'refund',?,'demo',?,?,?,?)",
      [
        id(),
        o.id,
        uid,
        refund,
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
  } else if (owed > paid && hold?.status === "captured") {
    const card = await savedCard(c, uid);
    const extra = owed - paid;
    if (card?.outcome === "ok") {
      await charge(c, o, uid, extra, card, reason.slice(0, 160));
      await notify(
        c,
        uid,
        o.id,
        `${o.name}: ${dollars(extra)} more was charged to your card (${reason}). Test mode.`,
        `extra:${id()}`,
      );
    } else
      await notify(
        c,
        uid,
        o.id,
        `${o.name}: you owe ${dollars(extra)} more (${reason}), but your card was declined. Update it in the group.`,
        `extra-failed:${id()}`,
      );
  }
}

/** Settle every buyer, e.g. after a price change or a cancellation. */
export async function settleAll(
  c: DB,
  o: O & { status?: string },
  reason: string,
  cancelled = false,
) {
  for (const m of await rows(
    c,
    "SELECT user_id FROM holds WHERE order_id=? UNION SELECT user_id FROM payments WHERE order_id=?",
    [o.id, o.id],
  ))
    await settle(c, o, m.user_id, reason, cancelled);
}

export function payments(db: Pool) {
  const r = Router();
  // The saved test card. Only the brand, last four digits and what the test
  // card number simulates are stored; the number never leaves the device.
  r.get("/payment-method", requireUser, async (req, res) => {
    const card = await savedCard(db, req.user!.id);
    const out: SavedCard | null = card
      ? { brand: card.brand, last4: card.last4 }
      : null;
    res.json(out);
  });
  r.put("/payment-method", verified, async (req, res) => {
    const b = z
      .object({
        brand: z.enum(["Visa", "Mastercard", "Amex"]),
        last4: z.string().regex(/^\d{4}$/),
        outcome: z.enum(["ok", "declined", "funds"]).default("ok"),
      })
      .parse(req.body);
    await transaction(db, async (c) => {
      await execute(
        c,
        "INSERT INTO payment_methods(user_id,brand,last4,outcome) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE brand=VALUES(brand),last4=VALUES(last4),outcome=VALUES(outcome)",
        [req.user!.id, b.brand, b.last4, b.outcome],
      );
      // A new card retries any holds that were declined.
      for (const h of await rows(
        c,
        "SELECT o.* FROM holds h JOIN orders o ON o.id=h.order_id WHERE h.user_id=? AND h.status='failed' AND o.status='locked'",
        [req.user!.id],
      ))
        await authorize(c, h, req.user!.id);
      // And any balance from a price increase after shopping.
      for (const o of await rows(
        c,
        "SELECT o.* FROM holds h JOIN orders o ON o.id=h.order_id WHERE h.user_id=? AND h.status='captured' AND o.status IN ('shopping','ready')",
        [req.user!.id],
      ))
        await settle(c, o, req.user!.id, "a price went up");
    });
    res.json({ ok: true });
  });
  return r;
}

/** Everything buyers have paid in, minus refunds. */
async function orderNet(c: DB, oid: string) {
  const r = await first(
    c,
    "SELECT COALESCE(SUM(CASE kind WHEN 'payment' THEN amount_cents ELSE -amount_cents END),0) AS cents FROM payments WHERE order_id=?",
    [oid],
  );
  return Number(r.cents);
}

/** When shopping starts, the organizer gets the Costco cost of buyers' shares. */
export async function releaseShoppingMoney(c: DB, o: O) {
  const members = await rows(
    c,
    "SELECT user_id FROM memberships WHERE order_id=? AND user_id<>?",
    [o.id, o.organizer_id],
  );
  let cents = 0;
  for (const m of members) {
    const cost = await memberCost(c, o.id, m.user_id);
    cents += Math.min(cost, Math.max(0, await netPaid(c, o.id, m.user_id)));
  }
  if (cents <= 0) return;
  await execute(
    c,
    "INSERT IGNORE INTO payouts(id,order_id,kind,amount_cents) VALUES(?,?,'shopping',?)",
    [id(), o.id, cents],
  );
  await notify(
    c,
    o.organizer_id,
    o.id,
    `${o.name}: ${dollars(cents)} released for shopping (test). Your reward is paid after every bag is handed out.`,
    `payout-shopping:${o.id}`,
  );
}

/** After hand-out: pay the organizer's reward, max($30, 10% of groceries). */
export async function releaseRemaining(c: DB, o: O) {
  const cents = organizerReward(await groceryCost(c, o));
  if (cents <= 0) return;
  await execute(
    c,
    "INSERT IGNORE INTO payouts(id,order_id,kind,amount_cents) VALUES(?,?,'fees',?)",
    [id(), o.id, cents],
  );
  await notify(
    c,
    o.organizer_id,
    o.id,
    `${o.name}: your ${dollars(cents)} organizer reward was released (test). Thanks for organizing!`,
    `payout-fees:${o.id}`,
  );
}

export async function payoutSummary(
  c: DB,
  o: { id: string; organizer_id: string },
): Promise<PayoutSummary> {
  const oid = o.id;
  const grocery = await groceryCost(c, o);
  const list = await rows(
    c,
    "SELECT kind,amount_cents,created_at FROM payouts WHERE order_id=? ORDER BY created_at",
    [oid],
  );
  const held = await first(
    c,
    "SELECT COALESCE(SUM(amount_cents),0) AS cents FROM holds WHERE order_id=? AND status='authorized'",
    [oid],
  );
  const collected = await orderNet(c, oid);
  const released = list.reduce((n, p) => n + p.amount_cents, 0);
  return {
    authorizedCents: Number(held.cents),
    collectedCents: collected,
    releasedCents: released,
    heldCents: Math.max(0, collected - released),
    groceryCents: grocery,
    rewardCents: organizerReward(grocery),
    releases: list.map((p) => ({
      kind: p.kind,
      amountCents: p.amount_cents,
      createdAt: iso(p.created_at),
    })),
  };
}
