import type { Pool } from "mysql2/promise";
import { first, rows, execute, transaction, type DB } from "../db.js";
import { fail } from "../errors.js";
import { id } from "../security.js";
import { notify } from "../notifications.js";
import { owner } from "../order-model.js";
import { priceGroup, payoutCost } from "./fee-engine.js";
import {
  fingerprint,
  profile,
  json,
  instruction,
  refundTo,
  enqueue,
} from "./engine.js";
export async function proposeSupplement(
  db: Pool,
  oid: string,
  uid: string,
  itemId: string,
  newPrice: number,
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      oid,
    ]);
    owner(o, uid);
    const item = await first(
      c,
      "SELECT * FROM order_items WHERE id=? AND order_id=? FOR UPDATE",
      [itemId, oid],
    );
    if (
      o.status !== "shopping" ||
      !item?.available ||
      item.bought ||
      newPrice <= item.price_cents
    )
      fail(
        409,
        "INVALID_SUPPLEMENT",
        "Propose a higher price for an available item before buying it.",
      );
    if (
      await first(
        c,
        "SELECT id FROM funding_supplements WHERE item_id=? AND status NOT IN('funded','cancelled') LIMIT 1",
        [itemId],
      )
    )
      fail(
        409,
        "SUPPLEMENT_PENDING",
        "Resolve the existing price-change proposal first.",
      );
    const claims = await rows(
      c,
      "SELECT * FROM share_claims WHERE item_id=? AND user_id<>? ORDER BY user_id",
      [itemId, o.organizer_id],
    );
    const pricing = priceGroup(
      claims
        .map((m) => ({
          memberId: m.user_id,
          groceryCents: Math.round(
            ((newPrice - item.price_cents) * m.quantity) / item.shares_per_pack,
          ),
        }))
        .filter((m) => m.groceryCents > 0),
    );
    const lines = pricing.members.map((m) => ({
      ...m,
      itemId,
      name: item.name,
      quantity: claims.find((x) => x.user_id === m.memberId)!.quantity,
      costBaseCents: Math.round(
        (item.price_cents *
          claims.find((x) => x.user_id === m.memberId)!.quantity) /
          item.shares_per_pack,
      ),
    }));
    const sid = id();
    await execute(
      c,
      "INSERT INTO funding_supplements(id,order_id,item_id,original_price_cents,new_price_cents,snapshot) VALUES(?,?,?,?,?,?)",
      [
        sid,
        oid,
        itemId,
        item.price_cents,
        newPrice,
        JSON.stringify({ lines, groceryCents: pricing.budgetCents }),
      ],
    );
    for (const line of lines)
      await notify(
        c,
        line.memberId,
        oid,
        `${o.name}: ${item.name} costs more at the store. Review the exact additional payment, or the organizer can skip/reduce the item. Nothing extra was charged.`,
        `supplement-proposed:${sid}`,
      );
    return { id: sid };
  });
}
export async function supplementQuotes(db: DB, oid: string, uid: string) {
  const p = await profile(db, uid),
    list = await rows(
      db,
      "SELECT * FROM funding_supplements WHERE order_id=? AND status NOT IN('funded','cancelled')",
      [oid],
    );
  const result = [];
  for (const s of list) {
    const line = json(s.snapshot).lines.find((l: any) => l.memberId === uid);
    if (!line) continue;
    const existing = await first(
      db,
      "SELECT status FROM funding_instructions WHERE supplement_id=? AND member_id=?",
      [s.id, uid],
    );
    const details = {
      supplementId: s.id,
      line,
      methodVersion: p?.method_version,
      methodId: p?.method_id,
    };
    result.push({
      id: s.id,
      ...line,
      amountCents: line.totalCents,
      fingerprint: fingerprint(details),
      status: existing?.status ?? "approval_needed",
    });
  }
  return result;
}
export async function approveSupplement(
  db: Pool,
  oid: string,
  uid: string,
  sid: string,
  hash: string,
  amount: number,
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
        oid,
      ]),
      s = await first(
        c,
        "SELECT * FROM funding_supplements WHERE id=? AND order_id=? FOR UPDATE",
        [sid, oid],
      );
    if (
      o.status !== "shopping" ||
      !s ||
      !["approval_needed", "collecting"].includes(s.status)
    )
      fail(
        409,
        "SUPPLEMENT_CLOSED",
        "This additional payment is no longer available.",
      );
    const quote = (await supplementQuotes(c, oid, uid)).find(
        (q) => q.id === sid,
      ),
      p = await profile(c, uid);
    if (
      !p?.ready ||
      !quote ||
      quote.fingerprint !== hash ||
      amount !== quote.amountCents
    )
      fail(
        409,
        "QUOTE_CHANGED",
        "Review the current additional purchase and payment method.",
      );
    const existing = await first(
      c,
      "SELECT id FROM funding_instructions WHERE supplement_id=? AND member_id=?",
      [sid, uid],
    );
    if (existing) return;
    const b = await first(
      c,
      "SELECT provider FROM funding_batches WHERE order_id=?",
      [oid],
    );
    if (p.provider !== b.provider)
      fail(409, "PROVIDER_MISMATCH", "Use the run’s payment provider.");
    const iid = await instruction(
      c,
      oid,
      uid,
      [json(s.snapshot).lines.find((l: any) => l.memberId === uid)],
      p,
      "supplement",
    );
    await execute(
      c,
      "UPDATE funding_instructions SET supplement_id=? WHERE id=?",
      [sid, iid],
    );
    await execute(
      c,
      "UPDATE funding_supplements SET status='collecting' WHERE id=?",
      [sid],
    );
  });
}
export async function progressSupplements(db: Pool) {
  for (const s of await rows(
    db,
    "SELECT * FROM funding_supplements WHERE status IN('collecting','funding')",
  ))
    await transaction(db, async (c) => {
      const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
        s.order_id,
      ]);
      if (o.status !== "shopping") return;
      const instructions = await rows(
        c,
        "SELECT * FROM funding_instructions WHERE supplement_id=?",
        [s.id],
      );
      if (
        instructions.length !== json(s.snapshot).lines.length ||
        instructions.some((i) => i.status !== "paid")
      )
        return;
      const purpose = `supplement:${s.id}`,
        amount = json(s.snapshot).groceryCents;
      await execute(
        c,
        "INSERT IGNORE INTO funding_payouts(order_id,purpose,amount_cents,cost_cents) VALUES(?,?,?,?)",
        [s.order_id, purpose, amount, payoutCost(amount)],
      );
      await execute(
        c,
        "UPDATE funding_supplements SET status='funding' WHERE id=?",
        [s.id],
      );
      if (
        await first(
          c,
          "SELECT order_id FROM funding_payouts WHERE order_id=? AND purpose=? AND status='paid'",
          [s.order_id, purpose],
        )
      ) {
        await execute(
          c,
          "UPDATE order_items SET price_cents=? WHERE id=? AND price_cents=?",
          [s.new_price_cents, s.item_id, s.original_price_cents],
        );
        await execute(
          c,
          "UPDATE funding_supplements SET status='funded' WHERE id=?",
          [s.id],
        );
      }
    });
}
export async function cancelSupplement(
  db: Pool,
  oid: string,
  uid: string,
  sid: string,
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      oid,
    ]);
    owner(o, uid);
    const s = await first(
      c,
      "SELECT * FROM funding_supplements WHERE id=? AND order_id=? FOR UPDATE",
      [sid, oid],
    );
    if (!s || s.status === "funded")
      fail(
        409,
        "SUPPLEMENT_FUNDED",
        "Reconcile funded purchases through item refunds.",
      );
    const payout = await first(
      c,
      "SELECT * FROM funding_payouts WHERE order_id=? AND purpose=?",
      [oid, `supplement:${sid}`],
    );
    if (payout)
      fail(
        409,
        "SUPPLEMENT_IN_TRANSIT",
        "Reconcile this pending grocery funding before canceling the price adjustment.",
      );
    await execute(
      c,
      "UPDATE funding_supplements SET status='cancelled' WHERE id=?",
      [sid],
    );
    const b = await first(
      c,
      "SELECT provider FROM funding_batches WHERE order_id=?",
      [oid],
    );
    for (const i of await rows(
      c,
      "SELECT * FROM funding_instructions WHERE supplement_id=?",
      [sid],
    )) {
      if (i.status === "paid")
        await refundTo(
          c,
          i,
          i.total_cents,
          "the additional purchase was canceled",
        );
      else if (i.provider_id)
        await enqueue(c, `cancel:${i.id}`, oid, i.id, b.provider, "cancel", {
          providerId: i.provider_id,
          instructionId: i.id,
        });
      else if (i.status === "queued")
        await execute(
          c,
          "UPDATE funding_instructions SET status='superseded' WHERE id=?",
          [i.id],
        );
    }
  });
}
