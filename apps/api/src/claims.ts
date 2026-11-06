import { invalidateApprovals } from "./payments/engine.js";
import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { claimsInput } from "@poold/contracts";
import { first, rows, execute, transaction } from "./db.js";
import { verified, publicUser } from "./auth.js";
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
      // Saving selections does not approve any charge. Approval is a separate exact quote.
      if (
        positive &&
        o.organizer_id !== req.user!.id &&
        !(await first(
          c,
          "SELECT user_id FROM payment_methods WHERE user_id=? UNION SELECT user_id FROM payment_profiles WHERE user_id=? AND ready=TRUE",
          [req.user!.id, req.user!.id],
        ))
      )
        fail(
          409,
          "CARD_REQUIRED",
          "Save a card first, then review and approve your basket for the closing time.",
        );
      if (positive && !existing) {
        const me = await publicUser(c as any, req.user!.id);
        if (me.blockedUntil)
          fail(
            403,
            "NO_SHOW_BLOCK",
            `You missed ${me.noShows} pickups recently, so you can’t join new groups until ${new Date(me.blockedUntil).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}.`,
          );
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
      await invalidateApprovals(c, o.id, req.user!.id);
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

  /**
   * Demo only: sample buyers (Jordan, Alex, Priya) fill up the packs in a
   * demo account's open group, so one account can show a whole run.
   */
  r.post("/orders/:id/demo-buyers", verified, async (req, res) => {
    if (!req.user!.demo)
      fail(403, "DEMO_ONLY", "Sample buyers are only for the demo account.");
    await transaction(db, async (c) => {
      const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
        req.params.id,
      ]);
      if (!o || o.organizer_id !== req.user!.id)
        fail(404, "NOT_FOUND", "Group not found.");
      if (o.status !== "open")
        fail(409, "NOT_OPEN", "Sample buyers can only join an open group.");
      const buyers = ["demo-jordan", "demo-alex", "demo-priya"];
      const its = await rows(
        c,
        "SELECT i.*,COALESCE((SELECT SUM(quantity) FROM share_claims s WHERE s.item_id=i.id),0) AS claimed FROM order_items i WHERE i.order_id=? AND i.available=TRUE ORDER BY name",
        [o.id],
      );
      const add = new Map<string, Map<string, number>>();
      let turn = 0;
      for (const it of its) {
        // Fill the pack that's started, or one whole pack if none is.
        const claimed = Number(it.claimed);
        const target = Math.min(
          it.pack_count * it.shares_per_pack,
          Math.max(1, Math.ceil(claimed / it.shares_per_pack)) *
            it.shares_per_pack,
        );
        for (let n = claimed; n < target; n++) {
          const who = buyers[turn++ % buyers.length];
          const mine = add.get(who) ?? new Map<string, number>();
          mine.set(it.id, (mine.get(it.id) ?? 0) + 1);
          add.set(who, mine);
        }
      }
      if (!add.size) fail(409, "NOTHING_LEFT", "Every pack is already full.");
      for (const [who, lines] of add) {
        await execute(
          c,
          "INSERT IGNORE INTO payment_methods(user_id,brand,last4,outcome) VALUES(?,'Visa','4242','ok')",
          [who],
        );
        await execute(
          c,
          "INSERT IGNORE INTO memberships(order_id,user_id,attending) VALUES(?,?,TRUE)",
          [o.id, who],
        );
        for (const [item, qty] of lines)
          await execute(
            c,
            "INSERT INTO share_claims(item_id,user_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)",
            [item, who, qty],
          );
      }
      await execute(c, "UPDATE orders SET revision=revision+1 WHERE id=?", [
        o.id,
      ]);
    });
    res.json({ ok: true });
  });
  return r;
}
