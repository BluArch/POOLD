import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { claimsInput } from "@poold/contracts";
import { first, rows, execute, transaction } from "./db.js";
import { verified } from "./auth.js";
import { getOrder } from "./order-model.js";
import { fail } from "./errors.js";
import { notify } from "./notifications.js";
import { id } from "./security.js";
export function claims(db: Pool) {
  const r = Router();
  r.put("/orders/:id/claims", verified, async (req, res) => {
    const b = claimsInput.parse(req.body);
    const invite =
      typeof req.query.invite === "string" ? req.query.invite : undefined;
    await transaction(db, async (c) => {
      // The parent order lock serializes both share and membership capacity checks.
      // Every claim, item update and state transition acquires this same lock first.
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        invite,
        true,
      );
      if (o.status !== "open" || new Date(o.deadline).getTime() <= Date.now())
        fail(
          409,
          "CLAIMS_CLOSED",
          "The deadline has passed or shares are locked.",
        );
      if (o.revision !== b.revision)
        fail(
          409,
          "ORDER_CHANGED",
          "An item or price changed. Refresh and review the updated estimates before confirming.",
        );
      const its = await rows(
        c,
        "SELECT * FROM order_items WHERE order_id=? FOR UPDATE",
        [o.id],
      );
      const existing = await first(
        c,
        "SELECT * FROM memberships WHERE order_id=? AND user_id=?",
        [o.id, req.user!.id],
      );
      const positive = b.claims.some((i) => i.quantity > 0);
      if (positive && !existing) {
        const count = await first(
          c,
          "SELECT COUNT(*) AS n FROM memberships WHERE order_id=?",
          [o.id],
        );
        if (Number(count.n) >= o.max_members)
          fail(409, "GROUP_FULL", "This group is full.");
      }
      for (const input of b.claims) {
        const it = its.find((i) => i.id === input.itemId);
        if (!it)
          fail(400, "INVALID_ITEM", "An item is not part of this order.");
        if (input.quantity > 0 && !it.available)
          fail(
            409,
            "UNAVAILABLE",
            "An item is no longer available. Refresh your selection.",
          );
        const other = await first(
          c,
          "SELECT COALESCE(SUM(quantity),0) AS n FROM share_claims WHERE item_id=? AND user_id<>?",
          [it.id, req.user!.id],
        );
        if (
          Number(other.n) + input.quantity >
          it.pack_count * it.shares_per_pack
        )
          fail(
            409,
            "CAPACITY",
            "There are not enough shares left. Refresh your selection.",
          );
      }
      if (positive && !existing)
        await execute(
          c,
          "INSERT INTO memberships(order_id,user_id,attending) VALUES(?,?,TRUE)",
          [o.id, req.user!.id],
        );
      await execute(
        c,
        "DELETE c FROM share_claims c JOIN order_items i ON i.id=c.item_id WHERE i.order_id=? AND c.user_id=?",
        [o.id, req.user!.id],
      );
      for (const input of b.claims)
        if (input.quantity > 0)
          await execute(
            c,
            "INSERT INTO share_claims(item_id,user_id,quantity) VALUES(?,?,?)",
            [input.itemId, req.user!.id, input.quantity],
          );
      if (!positive && o.organizer_id !== req.user!.id)
        await execute(
          c,
          "DELETE FROM memberships WHERE order_id=? AND user_id=?",
          [o.id, req.user!.id],
        );
      await notify(
        c,
        o.organizer_id,
        o.id,
        `${req.user!.name} ${positive ? "confirmed their shares" : "released their shares"} in ${o.name}.`,
        `claims:${id()}`,
      );
    });
    res.json({ ok: true });
  });
  return r;
}
