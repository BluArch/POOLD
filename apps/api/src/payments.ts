/** Compatibility summaries for the order UI; all new money movement uses payments/engine. */
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { type DB, first, rows, execute, transaction, iso } from "./db.js";
import { requireUser, verified } from "./auth.js";
import { fail } from "./errors.js";
import {
  quoteFor,
  profile,
  invalidateApprovals,
  prepareClose,
  cancelFunding,
  reconcileReductions,
  queuePayout,
  json,
} from "./payments/engine.js";
import { rewardFor, frozenRewardMinimum } from "./payments/fee-engine.js";
import type { Payment, PayoutSummary } from "@poold/contracts";
export { RETRY_MS } from "./payments/engine.js";
export async function memberCost(db: DB, oid: string, uid: string) {
  const o = await first(db, "SELECT * FROM orders WHERE id=?", [oid]);
  return (await quoteFor(db, o, uid)).mine?.groceryCents ?? 0;
}
export async function memberEstimate(db: DB, oid: string, uid: string) {
  const o = await first(db, "SELECT * FROM orders WHERE id=?", [oid]);
  const m = (await quoteFor(db, o, uid)).mine;
  return m ? m.groceryCents + m.markupCents : 0;
}
export async function memberOwed(db: DB, o: any, uid: string) {
  if (uid === o.organizer_id) return 0;
  const order = await first(db, "SELECT * FROM orders WHERE id=?", [o.id]);
  return (await quoteFor(db, order, uid)).mine?.totalCents ?? 0;
}
export async function netPaid(db: DB, oid: string, uid: string) {
  const r = await first(
    db,
    "SELECT COALESCE(SUM(total_cents-refunded_cents),0) AS n FROM funding_instructions WHERE order_id=? AND member_id=? AND status IN('paid','refund_pending','refunded')",
    [oid, uid],
  );
  return Number(r.n);
}
export async function ledger(
  db: DB,
  oid: string,
  uid: string,
  estimateCents: number,
  organizer = false,
) {
  const list = await rows(
    db,
    "SELECT * FROM funding_instructions WHERE order_id=? AND member_id=? AND status IN('paid','refund_pending','refunded') ORDER BY created_at DESC",
    [oid, uid],
  );
  const payments: Payment[] = list.flatMap((i) => [
    {
      id: i.id,
      kind: "payment" as const,
      amountCents: i.total_cents,
      createdAt: iso(i.created_at),
      ref: i.provider_id,
      cardBrand: null,
      cardLast4: null,
      note: "Approved scheduled payment",
    },
    ...(i.refunded_cents
      ? [
          {
            id: `refund:${i.id}`,
            kind: "refund" as const,
            amountCents: i.refunded_cents,
            createdAt: iso(i.created_at),
            ref: null,
            cardBrand: null,
            cardLast4: null,
            note: "Confirmed refund",
          },
        ]
      : []),
  ]);
  const paid = await netPaid(db, oid, uid),
    o = await first(db, "SELECT * FROM orders WHERE id=?", [oid]),
    q = await quoteFor(db, o, uid);
  return {
    paidCents: paid,
    dueCents: organizer
      ? 0
      : Math.max(0, (q.mine?.totalCents ?? estimateCents) - paid),
    feeCents: organizer ? 0 : (q.mine?.serviceFeeCents ?? 0),
    payments,
    hold: null,
  };
}
export async function settleAll(
  db: DB,
  o: any,
  reason: string,
  cancelled = false,
) {
  if (cancelled) await cancelFunding(db, o, reason);
  else {
    await invalidateApprovals(db, o.id);
    await reconcileReductions(db, o, reason);
  }
}
export async function closeScheduledPayments(db: DB, o: any, now = new Date()) {
  const order = await first(db, "SELECT * FROM orders WHERE id=?", [o.id]);
  await prepareClose(db, order, now);
}
export async function releaseRemaining(db: DB, o: any) {
  await queuePayout(db, o, "completion_reward");
}
export async function payoutSummary(db: DB, o: any): Promise<PayoutSummary> {
  const b = await first(db, "SELECT * FROM funding_batches WHERE order_id=?", [
    o.id,
  ]);
  const order = await first(db, "SELECT * FROM orders WHERE id=?", [o.id]);
  const q = await quoteFor(db, order, o.organizer_id);
  const list = await rows(
    db,
    "SELECT * FROM funding_payouts WHERE order_id=?",
    [o.id],
  );
  const collected = await first(
    db,
    "SELECT COALESCE(SUM(total_cents-refunded_cents),0) AS n FROM funding_instructions WHERE order_id=? AND status IN('paid','refunded')",
    [o.id],
  );
  const released = list
      .filter((p) => p.status === "paid")
      .reduce((n, p) => n + p.amount_cents, 0),
    grocery = b?.grocery_cents ?? q.snapshot.pricing?.budgetCents ?? 0;
  return {
    authorizedCents: 0,
    collectedCents: Number(collected.n),
    releasedCents: released,
    heldCents: Math.max(0, Number(collected.n) - released),
    groceryCents: grocery,
    rewardCents: b?.reward_cents ?? rewardFor(grocery),
    rewardMinimumCents: frozenRewardMinimum(
      b ? json(b.snapshot).pricing : null,
    ),
    releases: list
      .filter((p) => p.status === "paid")
      .map((p) => ({
        kind: p.purpose === "grocery" ? "shopping" : "fees",
        amountCents: p.amount_cents,
        createdAt: iso(p.confirmed_at),
      })),
  };
}
export function payments(db: Pool) {
  const r = Router();
  r.get("/payment-method", requireUser, async (req, res) => {
    const p = await profile(db, req.user!.id);
    res.json(
      p?.ready
        ? { brand: p.brand, last4: p.last4, provider: p.provider }
        : null,
    );
  });
  r.put("/payment-method", verified, async (req, res) => {
    if (process.env.PAYMENTS_PROVIDER === "stripe_test")
      fail(
        409,
        "HOSTED_SETUP_REQUIRED",
        "Save your card through Stripe sandbox setup.",
      );
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
      await execute(
        c,
        "INSERT INTO payment_profiles(user_id,provider,method_id,ready,brand,last4) VALUES(?,'demo',?,TRUE,?,?) ON DUPLICATE KEY UPDATE provider='demo',method_version=method_version+1,method_id=VALUES(method_id),ready=TRUE,brand=VALUES(brand),last4=VALUES(last4)",
        [req.user!.id, `demo:${req.user!.id}`, b.brand, b.last4],
      );
      await execute(
        c,
        "UPDATE payment_approvals SET status='revoked' WHERE member_id=? AND status='approved'",
        [req.user!.id],
      );
    });
    res.json({ ok: true, requiresBasketApproval: true });
  });
  return r;
}
