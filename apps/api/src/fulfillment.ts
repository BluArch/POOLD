import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { verified } from "./auth.js";
import { rows, first, execute, transaction } from "./db.js";
import { getOrder, owner, insertDraft } from "./order-model.js";
import { fail, RATE_LIMIT_ERROR } from "./errors.js";
import { notify, notifyMembers } from "./notifications.js";
import { hash, id } from "./security.js";
import { orderInput } from "@poold/contracts";
const deliverableSql = `SELECT m.* FROM memberships m WHERE m.order_id=? AND EXISTS(SELECT 1 FROM share_claims c JOIN order_items i ON i.id=c.item_id WHERE c.user_id=m.user_id AND i.order_id=m.order_id AND i.available=TRUE AND c.quantity>0)`;
export function fulfillment(db: Pool) {
  const r = Router();
  r.post("/orders/:id/status", verified, async (req, res) => {
    const status = z
      .enum(["locked", "shopping", "ready", "completed", "cancelled"])
      .parse(req.body.status);
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      const next: Record<string, string> = {
        open: "locked",
        locked: "shopping",
        shopping: "ready",
        ready: "completed",
      };
      if (status === "cancelled") {
        if (["completed", "cancelled"].includes(o.status))
          fail(409, "TERMINAL", "This order has already ended.");
        await execute(c, "DELETE FROM collection_tokens WHERE order_id=?", [
          o.id,
        ]);
      } else if (next[o.status] !== status)
        fail(409, "INVALID_TRANSITION", "Follow the order steps in sequence.");
      const its = await rows(
        c,
        `SELECT i.*,COALESCE((SELECT SUM(quantity) FROM share_claims WHERE item_id=i.id),0) AS claimed FROM order_items i WHERE order_id=?`,
        [o.id],
      );
      const needed = its.filter((i) => i.available && Number(i.claimed) > 0);
      if (status === "shopping") {
        if (!needed.length)
          fail(
            409,
            "NO_SHARES",
            "No available shares are committed. Cancel this order or resolve items before shopping.",
          );
        if (
          needed.some(
            (i) =>
              Number(i.claimed) % i.shares_per_pack !== 0 &&
              i.shortfall_decision === "pending",
          )
        )
          fail(
            409,
            "SHORTFALL",
            "Review each unfilled pack and decide to proceed or skip before shopping.",
          );
      }
      const members = await rows(c, deliverableSql, [o.id]);
      if (status === "ready") {
        if (!needed.length || !members.length)
          fail(409, "NO_SHARES", "No bags need collection. Cancel this order.");
        if (needed.some((i) => !i.bought))
          fail(
            409,
            "SHOPPING_INCOMPLETE",
            "Check off every required item before pickup.",
          );
        if (members.some((m) => !m.packed))
          fail(
            409,
            "PACKING_INCOMPLETE",
            "Pack every required bag before pickup.",
          );
        for (const m of members) {
          const code = randomBytes(10).toString("hex").toUpperCase();
          await execute(
            c,
            "INSERT INTO collection_tokens(order_id,user_id,token_hash,code) VALUES(?,?,?,?)",
            [o.id, m.user_id, hash(code), code],
          );
        }
      }
      if (
        status === "completed" &&
        (!members.length || members.some((m) => !m.collected_at))
      )
        fail(
          409,
          "PICKUPS_INCOMPLETE",
          "Confirm every required collection before completing the order.",
        );
      await execute(c, "UPDATE orders SET status=? WHERE id=?", [status, o.id]);
      const labels = {
        locked: "Shares are locked.",
        shopping: "Shopping has started.",
        ready: `Ready for pickup at ${o.pickup_location}.`,
        completed: "Completed. Thank you for sharing!",
        cancelled: "This order was cancelled.",
      };
      await notifyMembers(
        c,
        o.id,
        `${o.name}: ${labels[status]}`,
        `status:${o.id}:${status}`,
      );
    });
    res.json({ ok: true });
  });
  r.patch("/orders/:id/items/:itemId", verified, async (req, res) => {
    const b = z
      .object({
        priceCents: z.number().int().min(1).max(1000000).optional(),
        available: z.boolean().optional(),
        bought: z.boolean().optional(),
        shortfallDecision: z.enum(["pending", "proceed", "skip"]).optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Choose an item change.")
      .parse(req.body);
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      if (!["open", "locked", "shopping"].includes(o.status))
        fail(409, "ITEMS_LOCKED", "Items cannot change after pickup is ready.");
      const it = await first(
        c,
        "SELECT * FROM order_items WHERE id=? AND order_id=? FOR UPDATE",
        [req.params.itemId, o.id],
      );
      if (!it) fail(404, "NOT_FOUND", "Item not found.");
      if (b.bought !== undefined && o.status !== "shopping")
        fail(
          409,
          "NOT_SHOPPING",
          "The checklist is available during shopping.",
        );
      if (
        b.bought === true &&
        (!it.available ||
          b.available === false ||
          b.shortfallDecision === "skip")
      )
        fail(409, "UNAVAILABLE", "An unavailable item cannot be checked off.");
      const available =
          b.shortfallDecision === "skip"
            ? false
            : (b.available ?? !!it.available),
        price = b.priceCents ?? it.price_cents,
        changed = price !== it.price_cents || available !== !!it.available;
      const bought = changed ? false : (b.bought ?? !!it.bought);
      await execute(
        c,
        "UPDATE order_items SET price_cents=?,available=?,bought=?,shortfall_decision=? WHERE id=?",
        [
          price,
          available,
          bought,
          b.shortfallDecision ?? it.shortfall_decision,
          it.id,
        ],
      );
      if (changed) {
        await execute(c, "UPDATE orders SET revision=revision+1 WHERE id=?", [
          o.id,
        ]);
        await execute(
          c,
          "UPDATE memberships m SET packed=FALSE WHERE order_id=? AND EXISTS(SELECT 1 FROM share_claims WHERE item_id=? AND user_id=m.user_id)",
          [o.id, it.id],
        );
        await notifyMembers(
          c,
          o.id,
          `${it.name} in ${o.name}: ${available ? `estimated pack price is now CAD ${(price / 100).toFixed(2)}` : "unavailable; excluded from product-cost estimates"}. Review your order.`,
          `item:${id()}`,
        );
      }
    });
    res.json({ ok: true });
  });
  r.post("/orders/:id/pack", verified, async (req, res) => {
    const b = z
      .object({ userId: z.string().min(1).max(36), packed: z.boolean() })
      .parse(req.body);
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      if (o.status !== "shopping")
        fail(409, "NOT_PACKING", "Packing is available while shopping.");
      const m = (await rows(c, deliverableSql, [o.id])).find(
        (m) => m.user_id === b.userId,
      );
      if (!m)
        fail(404, "NO_BAG", "This member has no available shares to pack.");
      const missing = await first(
        c,
        `SELECT COUNT(*) AS n FROM share_claims sc JOIN order_items i ON i.id=sc.item_id WHERE i.order_id=? AND sc.user_id=? AND i.available=TRUE AND i.bought=FALSE`,
        [o.id, b.userId],
      );
      if (b.packed && Number(missing.n))
        fail(
          409,
          "ITEMS_NOT_BOUGHT",
          "Buy this member’s items before marking the bag packed.",
        );
      await execute(
        c,
        "UPDATE memberships SET packed=? WHERE order_id=? AND user_id=?",
        [b.packed, o.id, b.userId],
      );
    });
    res.json({ ok: true });
  });
  r.post("/orders/:id/arrive", verified, async (req, res) => {
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      if (o.status !== "ready")
        fail(409, "NOT_READY", "This order is not ready for pickup.");
      const m = await first(
        c,
        "SELECT * FROM memberships WHERE order_id=? AND user_id=?",
        [o.id, req.user!.id],
      );
      const ct = await first(
        c,
        "SELECT user_id FROM collection_tokens WHERE order_id=? AND user_id=? AND used_at IS NULL",
        [o.id, req.user!.id],
      );
      if (!m || !ct || m.collected_at)
        fail(
          403,
          "NO_PICKUP",
          "You have no outstanding pickup for this order.",
        );
      await execute(
        c,
        "UPDATE memberships SET arrived=TRUE WHERE order_id=? AND user_id=?",
        [o.id, req.user!.id],
      );
      await notify(
        c,
        o.organizer_id,
        o.id,
        `${req.user!.name} has arrived for ${o.name}.`,
        `arrival:${o.id}:${req.user!.id}`,
      );
    });
    res.json({ ok: true });
  });
  r.post(
    "/orders/:id/collect",
    verified,
    rateLimit({
      windowMs: 60000,
      limit: 30,
      legacyHeaders: false,
      message: RATE_LIMIT_ERROR,
    }),
    async (req, res) => {
      const code = z
        .string()
        .trim()
        .min(10)
        .max(40)
        .parse(req.body.code)
        .replace(/[\s-]/g, "")
        .toUpperCase();
      await transaction(db, async (c) => {
        const o = await getOrder(
          c,
          req.params.id as string,
          req.user!.id,
          undefined,
          true,
        );
        owner(o, req.user!.id);
        if (o.status !== "ready")
          fail(409, "NOT_READY", "This order is not ready for pickup.");
        const ct = await first(
          c,
          "SELECT * FROM collection_tokens WHERE order_id=? AND token_hash=? FOR UPDATE",
          [o.id, hash(code)],
        );
        if (!ct || ct.used_at)
          fail(
            409,
            "INVALID_COLLECTION",
            "This collection code is invalid or was already used.",
          );
        const m = await first(
          c,
          "SELECT * FROM memberships WHERE order_id=? AND user_id=?",
          [o.id, ct.user_id],
        );
        if (!m?.packed || m.collected_at)
          fail(
            409,
            "NO_PICKUP",
            "This bag is not ready or has already been collected.",
          );
        await execute(
          c,
          "UPDATE collection_tokens SET used_at=UTC_TIMESTAMP(3) WHERE order_id=? AND user_id=?",
          [o.id, ct.user_id],
        );
        await execute(
          c,
          "UPDATE memberships SET collected_at=UTC_TIMESTAMP(3) WHERE order_id=? AND user_id=?",
          [o.id, ct.user_id],
        );
        await notify(
          c,
          ct.user_id,
          o.id,
          `Your ${o.name} collection is confirmed.`,
          `collected:${o.id}:${ct.user_id}`,
        );
      });
      res.json({ ok: true });
    },
  );
  r.post("/orders/:id/repeat", verified, async (req, res) => {
    const dates = z
      .object({
        deadline: z.iso.datetime({ offset: true }),
        purchaseAt: z.iso.datetime({ offset: true }),
        pickupAt: z.iso.datetime({ offset: true }),
        pickupEnd: z.iso.datetime({ offset: true }),
      })
      .parse(req.body);
    const oid = await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      const its = await rows(c, "SELECT * FROM order_items WHERE order_id=?", [
        o.id,
      ]);
      const input = orderInput.parse({
        name: o.name,
        store: o.store,
        kind: o.kind,
        visibility: o.visibility,
        maxMembers: o.max_members,
        cadence: o.cadence,
        pickupLocation: o.pickup_location,
        pickupLat: o.pickup_lat,
        pickupLng: o.pickup_lng,
        publicPickup: true,
        ...dates,
        items: its.map((i) => ({
          name: i.name,
          category: i.category,
          packLabel: i.pack_label,
          shareLabel: i.share_label,
          sharesPerPack: i.shares_per_pack,
          packCount: i.pack_count,
          priceCents: i.price_cents,
          referenceShareCents: i.reference_share_cents,
          storage: i.storage,
          portioning: i.portioning,
        })),
      });
      if (Date.parse(input.deadline) <= Date.now())
        fail(400, "PAST_DEADLINE", "Choose new dates in the future.");
      return insertDraft(c, input, req.user!.id);
    });
    res.status(201).json({ id: oid });
  });
  return r;
}
