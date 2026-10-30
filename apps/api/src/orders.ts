import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { orderInput, itemInput } from "@poold/contracts";
import { z } from "zod";
import { rows, first, execute, transaction } from "./db.js";
import { notify, notifyMembers } from "./notifications.js";
import { verified } from "./auth.js";
import { fail } from "./errors.js";
import {
  getOrder,
  owner,
  summary,
  orderView,
  insertDraft,
  insertItems,
  validateFuture,
} from "./order-model.js";
export function orders(db: Pool) {
  const r = Router();
  r.use("/orders", verified);
  r.get("/orders", async (req, res) => {
    const filter = z
      .object({
        scope: z.enum(["discover", "mine", "organizing"]).default("discover"),
        store: z.string().max(80).optional(),
        pickup: z.string().max(160).optional(),
        date: z.iso.date().optional(),
        kind: z.enum(["community", "quick"]).optional(),
      })
      .parse(req.query);
    const clauses: string[] = [],
      params: unknown[] = [];
    if (filter.scope === "discover")
      clauses.push(
        "o.visibility='public' AND o.status='open' AND o.deadline>UTC_TIMESTAMP(3)",
      );
    if (filter.scope === "mine") {
      clauses.push(
        "o.status<>'draft' AND EXISTS(SELECT 1 FROM memberships m WHERE m.order_id=o.id AND m.user_id=?)",
      );
      params.push(req.user!.id);
    }
    if (filter.scope === "organizing") {
      clauses.push("o.organizer_id=?");
      params.push(req.user!.id);
    }
    if (filter.store) {
      clauses.push("o.store LIKE ?");
      params.push(`%${filter.store}%`);
    }
    if (filter.pickup) {
      clauses.push("o.pickup_location LIKE ?");
      params.push(`%${filter.pickup}%`);
    }
    // A date filter is a Vancouver calendar date; MySQL timezone tables are not required.
    if (filter.date) {
      const day = new Date(`${filter.date}T12:00:00Z`);
      const dateFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Vancouver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const candidates = await rows(
        db,
        `SELECT o.* FROM orders o WHERE ${clauses.join(" AND ")} ORDER BY o.created_at DESC`,
        params,
      );
      const matching = candidates.filter(
        (o) =>
          dateFmt.format(new Date(o.pickup_at)) === dateFmt.format(day) &&
          (!filter.kind || o.kind === filter.kind),
      );
      res.json(
        await Promise.all(matching.map((o) => summary(db, o, req.user!.id))),
      );
      return;
    }
    if (filter.kind) {
      clauses.push("o.kind=?");
      params.push(filter.kind);
    }
    const os = await rows(
      db,
      `SELECT o.* FROM orders o WHERE ${clauses.join(" AND ")} ORDER BY o.created_at DESC LIMIT 100`,
      params,
    );
    res.json(await Promise.all(os.map((o) => summary(db, o, req.user!.id))));
  });
  r.get("/orders/:id", async (req, res) => {
    const invite =
      typeof req.query.invite === "string" ? req.query.invite : undefined;
    const o = await getOrder(db, req.params.id as string, req.user!.id, invite);
    res.json(await orderView(db, o, req.user!.id));
  });
  r.post("/orders", async (req, res) => {
    const b = orderInput.parse(req.body);
    validateFuture(b);
    const oid = await transaction(db, (c) => insertDraft(c, b, req.user!.id));
    res.status(201).json({ id: oid });
  });
  r.put("/orders/:id", async (req, res) => {
    const b = orderInput.parse(req.body);
    validateFuture(b);
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      if (o.status !== "draft")
        fail(
          409,
          "NOT_DRAFT",
          "Only a draft can be edited. Published items can be updated from the dashboard.",
        );
      await execute(
        c,
        `UPDATE orders SET name=?,store=?,kind=?,visibility=?,deadline=?,purchase_at=?,pickup_at=?,pickup_end=?,pickup_location=?,pickup_lat=?,pickup_lng=?,max_members=?,cadence=?,revision=revision+1 WHERE id=?`,
        [
          b.name,
          b.store,
          b.kind,
          b.visibility,
          new Date(b.deadline),
          new Date(b.purchaseAt),
          new Date(b.pickupAt),
          new Date(b.pickupEnd),
          b.pickupLocation,
          b.pickupLat,
          b.pickupLng,
          b.maxMembers,
          b.cadence,
          o.id,
        ],
      );
      await execute(c, "DELETE FROM order_items WHERE order_id=?", [o.id]);
      await insertItems(c, o.id, b.items);
    });
    res.json({ ok: true });
  });
  /** Add an item to a published group that is still collecting shares. */
  r.post("/orders/:id/items", async (req, res) => {
    const b = z
      .object({ item: itemInput, requestId: z.string().uuid().optional() })
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
      if (o.status === "draft")
        fail(409, "IS_DRAFT", "Edit the draft to add items.");
      if (o.status !== "open" || new Date(o.deadline).getTime() <= Date.now())
        fail(
          409,
          "GROUP_CLOSED",
          "Items can only be added while the group is collecting shares.",
        );
      if (o.kind === "quick")
        fail(409, "QUICK_SPLIT", "A quick split has exactly one item.");
      const count = await first(
        c,
        "SELECT COUNT(*) AS n FROM order_items WHERE order_id=?",
        [o.id],
      );
      if (Number(count.n) >= 30)
        fail(409, "TOO_MANY_ITEMS", "A group can have up to 30 items.");
      await insertItems(c, o.id, [b.item]);
      await execute(c, "UPDATE orders SET revision=revision+1 WHERE id=?", [
        o.id,
      ]);
      if (b.requestId) {
        const pr = await first(
          c,
          "SELECT * FROM product_requests WHERE id=? AND order_id=? FOR UPDATE",
          [b.requestId, o.id],
        );
        if (!pr) fail(404, "NOT_FOUND", "Request not found.");
        await execute(
          c,
          "UPDATE product_requests SET status='added' WHERE id=?",
          [pr.id],
        );
        await notify(
          c,
          pr.creator_id,
          o.id,
          `${b.item.name} was added to ${o.name}. You can claim a share now.`,
          `request-added:${pr.id}`,
        );
      }
      await notifyMembers(
        c,
        o.id,
        `${b.item.name} was added to ${o.name}.`,
        `item-added:${o.id}:${b.item.name.toLowerCase()}`,
      );
    });
    res.status(201).json({ ok: true });
  });
  r.post("/orders/:id/publish", async (req, res) => {
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      if (o.status !== "draft")
        fail(409, "NOT_DRAFT", "This order has already been published.");
      if (new Date(o.deadline).getTime() <= Date.now())
        fail(
          409,
          "PAST_DEADLINE",
          "Edit the draft and choose new dates before publishing.",
        );
      const its = await rows(c, "SELECT id FROM order_items WHERE order_id=?", [
        o.id,
      ]);
      if (!its.length || (o.kind === "quick" && its.length !== 1))
        fail(
          400,
          "ITEMS_REQUIRED",
          "Add items before publishing. Quick splits need one item.",
        );
      await execute(c, "UPDATE orders SET status='open' WHERE id=?", [o.id]);
    });
    res.json({ ok: true });
  });
  return r;
}
