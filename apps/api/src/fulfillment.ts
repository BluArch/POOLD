import { Router } from "express";
import { randomInt } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { verified } from "./auth.js";
import { rows, first, execute, transaction, type DB } from "./db.js";
import { getOrder, owner, insertDraft } from "./order-model.js";
import { fail, RATE_LIMIT_ERROR } from "./errors.js";
import { notify, notifyMembers } from "./notifications.js";
import { hash, id } from "./security.js";
import { orderInput } from "@poold/contracts";
import {
  settleAll,
  placeHolds,
  dropFailedHolds,
  failedHolds,
  captureHolds,
  releaseShoppingMoney,
  releaseRemaining,
} from "./payments.js";
import { proofInput, ratingInput } from "@poold/contracts";
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
      // Closing shares: the organizer must be buying too, then each buyer's
      // card gets a hold. The organizer can close even if nobody else joined.
      if (status === "locked") {
        const problem = await closeProblem(c, o, { needBuyers: false });
        if (problem) fail(409, problem.code, problem.message);
      }
      // Shopping can't start while any buyer still has a declined card.
      if (status === "shopping") {
        await dropFailedHolds(c, o);
        const waiting = await failedHolds(c, o.id);
        if (waiting.length)
          fail(
            409,
            "HOLDS_PENDING",
            `${waiting.length} ${waiting.length === 1 ? "buyer’s card was" : "buyers’ cards were"} declined. They have until ${new Date(waiting[0].retry_until).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver" })} to fix it; after that their shares drop and you can start.`,
          );
      }
      if (
        status === "ready" &&
        !(await first(
          c,
          "SELECT order_id FROM shopping_proofs WHERE order_id=?",
          [o.id],
        ))
      )
        fail(
          409,
          "PROOF_REQUIRED",
          "Upload the receipt and a photo of the items before pickup opens.",
        );
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
        // Items come in sealed units, so there is no separate packing step:
        // once shopping is done, every member's share is ready to hand out.
        for (const m of members)
          await execute(
            c,
            "UPDATE memberships SET packed=TRUE WHERE order_id=? AND user_id=?",
            [o.id, m.user_id],
          );
        // Six-digit pickup codes, unique within the group (the rate limit on
        // /collect keeps guessing impractical).
        const used = new Set<string>();
        for (const m of members) {
          // The organizer already has their own items; no code needed.
          if (m.user_id === o.organizer_id) {
            await execute(
              c,
              "UPDATE memberships SET collected_at=UTC_TIMESTAMP(3) WHERE order_id=? AND user_id=?",
              [o.id, m.user_id],
            );
            continue;
          }
          let code: string;
          do code = String(randomInt(0, 1000000)).padStart(6, "0");
          while (used.has(code));
          used.add(code);
          await execute(
            c,
            "INSERT INTO collection_tokens(order_id,user_id,token_hash,code) VALUES(?,?,?,?)",
            [o.id, m.user_id, hash(code), code],
          );
        }
      }
      if (
        status === "completed" &&
        (!members.length ||
          members.some((m) => !m.collected_at && !m.no_show_at))
      )
        fail(
          409,
          "PICKUPS_INCOMPLETE",
          "Confirm every required collection before completing the order.",
        );
      await execute(c, "UPDATE orders SET status=? WHERE id=?", [status, o.id]);
      if (status === "locked") await placeHolds(c, o);
      if (status === "shopping") {
        await captureHolds(c, o);
        await releaseShoppingMoney(c, o);
      }
      if (status === "completed") await releaseRemaining(c, o);
      if (status === "cancelled")
        await settleAll(c, o, "the group was cancelled", true);

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
        // Cheaper or unavailable now: refund what members overpaid.
        await settleAll(
          c,
          o,
          available ? `${it.name} got cheaper` : `${it.name} was unavailable`,
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
        .max(20)
        .parse(req.body.code)
        .replace(/[\s-]/g, "");
      if (!/^\d{6}$/.test(code))
        fail(400, "INVALID_COLLECTION", "Pickup codes are 6 digits.");
      // Optional: the member whose card the organizer typed the code into.
      const forUser = z
        .string()
        .min(1)
        .max(36)
        .optional()
        .parse(req.body.userId);
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
        if (forUser && ct.user_id !== forUser)
          fail(
            409,
            "WRONG_MEMBER",
            "This code belongs to a different member. Check whose bag you’re handing out.",
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
  // Proof of purchase: the full receipt and a photo of the items, uploaded
  // when shopping is done. Every member can see them.
  r.post("/orders/:id/proof", verified, async (req, res) => {
    const b = proofInput.parse(req.body);
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
        fail(
          409,
          "NOT_SHOPPING",
          "Upload proof while you’re shopping, before pickup opens.",
        );
      await execute(
        c,
        "INSERT INTO shopping_proofs(order_id,receipt_photo,items_photo,receipt_total_cents) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE receipt_photo=VALUES(receipt_photo),items_photo=VALUES(items_photo),receipt_total_cents=VALUES(receipt_total_cents),uploaded_at=UTC_TIMESTAMP(3)",
        [o.id, b.receiptPhoto, b.itemsPhoto, b.receiptTotalCents],
      );
    });
    res.json({ ok: true });
  });
  // No-show: once the 24-hour grace period after pickup has passed, the
  // organizer keeps the bag and the buyer's payment, and the buyer gets a mark.
  r.post("/orders/:id/no-show", verified, async (req, res) => {
    const userId = z.string().min(1).max(36).parse(req.body.userId);
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
        fail(409, "NOT_READY", "No-shows can only be marked during pickup.");
      if (new Date(o.pickup_end).getTime() + GRACE_MS > Date.now())
        fail(
          409,
          "GRACE_PERIOD",
          "Hold the bag for 24 hours after pickup ends. You can mark a no-show after that.",
        );
      await markNoShow(c, o, userId);
    });
    res.json({ ok: true });
  });
  // Buyers rate the organizer once they've picked up their bag.
  r.post("/orders/:id/rating", verified, async (req, res) => {
    const b = ratingInput.parse(req.body);
    await transaction(db, async (c) => {
      const o = await getOrder(c, req.params.id as string, req.user!.id);
      if (o.organizer_id === req.user!.id)
        fail(409, "ORGANIZER", "You can’t rate your own group.");
      const m = await first(
        c,
        "SELECT collected_at FROM memberships WHERE order_id=? AND user_id=?",
        [o.id, req.user!.id],
      );
      if (!m?.collected_at)
        fail(
          409,
          "NOT_COLLECTED",
          "You can rate the organizer after you pick up your bag.",
        );
      await execute(
        c,
        "INSERT INTO ratings(order_id,buyer_id,organizer_id,stars,comment) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE stars=VALUES(stars),comment=VALUES(comment)",
        [o.id, req.user!.id, o.organizer_id, b.stars, b.comment],
      );
      await notify(
        c,
        o.organizer_id,
        o.id,
        `${req.user!.name} rated your ${o.name} run ${"★".repeat(b.stars)}${b.comment ? `: “${b.comment}”` : ""}`,
        `rating:${o.id}:${req.user!.id}`,
      );
    });
    res.json({ ok: true });
  });
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
          unit: i.unit,
          packUnits: i.pack_units,
          shareUnits: i.share_units,
          catalogKey: i.catalog_key,
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

export const GRACE_MS = 24 * 3600000;

/** Record a buyer no-show: they forfeit the bag and their payment. */
export async function markNoShow(
  c: DB,
  o: { id: string; name: string; organizer_id: string },
  userId: string,
) {
  const m = await first(
    c,
    "SELECT * FROM memberships WHERE order_id=? AND user_id=? FOR UPDATE",
    [o.id, userId],
  );
  if (!m || m.collected_at || m.no_show_at || userId === o.organizer_id) return;
  await execute(
    c,
    "UPDATE memberships SET no_show_at=UTC_TIMESTAMP(3) WHERE order_id=? AND user_id=?",
    [o.id, userId],
  );
  await execute(
    c,
    "UPDATE collection_tokens SET used_at=UTC_TIMESTAMP(3) WHERE order_id=? AND user_id=? AND used_at IS NULL",
    [o.id, userId],
  );
  await execute(
    c,
    "INSERT IGNORE INTO no_shows(id,user_id,order_id,role) VALUES(?,?,?,'buyer')",
    [id(), userId, o.id],
  );
  await notify(
    c,
    userId,
    o.id,
    `${o.name}: you missed pickup and the 24-hour hold ended. Your bag and payment go to the organizer, and a no-show was added to your account.`,
    `no-show:${o.id}:${userId}`,
  );
}

/**
 * Why shares can't close yet: the organizer must have their own shares (POOLD
 * is for splitting your own trip) and someone else must have joined.
 */
export async function closeProblem(
  c: DB,
  o: { id: string; organizer_id: string },
  { needBuyers = true } = {},
) {
  const mine = await first(
    c,
    "SELECT COALESCE(SUM(s.quantity),0) AS n FROM share_claims s JOIN order_items i ON i.id=s.item_id WHERE i.order_id=? AND s.user_id=? AND i.available=TRUE",
    [o.id, o.organizer_id],
  );
  if (!Number(mine.n))
    return {
      code: "ORGANIZER_SHARE",
      message:
        "Add your own shares first. Organizers split runs they’re shopping for anyway.",
    };
  if (!needBuyers) return null;
  const others = await first(
    c,
    "SELECT COUNT(DISTINCT s.user_id) AS n FROM share_claims s JOIN order_items i ON i.id=s.item_id WHERE i.order_id=? AND s.user_id<>? AND i.available=TRUE",
    [o.id, o.organizer_id],
  );
  if (!Number(others.n))
    return {
      code: "NO_BUYERS",
      message: "Nobody else has joined yet, so there’s nothing to split.",
    };
  return null;
}
