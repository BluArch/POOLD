import type { DB } from "../db.js";
import { rows, first } from "../db.js";
import { allocate, priceGroup, type Components } from "./fee-engine.js";
export type BasketLine = Components & {
  itemId: string;
  memberId: string;
  quantity: number;
  name: string;
};
export async function basketSnapshot(
  db: DB,
  orderId: string,
  provisional = false,
) {
  const order = await first(db, "SELECT organizer_id FROM orders WHERE id=?", [
    orderId,
  ]);
  const items = await rows(
    db,
    "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
    [orderId],
  );
  const claims = await rows(
    db,
    `SELECT c.* FROM share_claims c JOIN order_items i ON i.id=c.item_id WHERE i.order_id=? ORDER BY c.item_id,c.user_id`,
    [orderId],
  );
  const raw: {
      itemId: string;
      memberId: string;
      quantity: number;
      groceryCents: number;
      name: string;
    }[] = [],
    problems: string[] = [],
    warnings: string[] = [];
  for (const item of items) {
    if (!item.available || item.shortfall_decision === "skip") continue;
    const buyers = claims.filter(
        (c) => c.item_id === item.id && c.quantity > 0,
      ),
      quantity = buyers.reduce((n, c) => n + Number(c.quantity), 0);
    if (!quantity) continue;
    if (
      quantity % item.shares_per_pack !== 0 &&
      item.shortfall_decision !== "proceed"
    )
      (provisional ? warnings : problems).push(
        `${item.name}: assign the remaining pack shares or explicitly cover leftovers before closing.`,
      );
    // An accepted remainder belongs to the organizer outside app payments.
    const actual =
      (Number(item.price_cents) * quantity) / Number(item.shares_per_pack);
    const costs = allocate(
      Math.round(actual),
      buyers.map((c) => ({
        memberId: c.user_id,
        groceryCents: Number(c.quantity),
      })),
    );
    for (const buyer of buyers)
      if (buyer.user_id !== order.organizer_id)
        raw.push({
          itemId: item.id,
          memberId: buyer.user_id,
          name: item.name,
          quantity: Number(buyer.quantity),
          groceryCents: costs.get(buyer.user_id)!,
        });
  }
  const totals = new Map<string, number>();
  for (const l of raw)
    totals.set(l.memberId, (totals.get(l.memberId) ?? 0) + l.groceryCents);
  const baskets = [...totals].map(([memberId, groceryCents]) => ({
    memberId,
    groceryCents,
  }));
  const pricing = baskets.length ? priceGroup(baskets) : null;
  const lines: BasketLine[] = [];
  for (const member of pricing?.members ?? []) {
    const mine = raw.filter((l) => l.memberId === member.memberId),
      weights = mine.map((l) => ({
        memberId: l.itemId,
        groceryCents: l.groceryCents,
      }));
    const marks = allocate(member.markupCents, weights),
      fees = allocate(member.serviceFeeCents, weights),
      taxes = allocate(member.feeTaxCents, weights);
    for (const line of mine) {
      const markupCents = marks.get(line.itemId)!,
        serviceFeeCents = fees.get(line.itemId)!,
        feeTaxCents = taxes.get(line.itemId)!;
      lines.push({
        ...line,
        markupCents,
        serviceFeeCents,
        feeTaxCents,
        totalCents:
          line.groceryCents + markupCents + serviceFeeCents + feeTaxCents,
      });
    }
  }
  return { baskets, lines, problems, warnings, pricing };
}
