import { Router } from "express";
import type { Pool } from "mysql2/promise";
import { z } from "zod";
import {
  wishlistInput,
  wishlistItemInput,
  CATALOG,
  type Wishlist,
} from "@poold/contracts";
import { verified } from "./auth.js";
import { execute, first, rows, iso, transaction, type DB } from "./db.js";
import { fail } from "./errors.js";
import { notify } from "./notifications.js";
import { id } from "./security.js";

/**
 * Wishlists: buyers say what they want from a store, others join and add to
 * it, and an organizer turns it into a real group.
 */
export async function wishlistView(
  c: DB,
  w: any,
  uid: string,
): Promise<Wishlist> {
  const items = await rows(
    c,
    `SELECT i.*,(SELECT COUNT(*) FROM wishlist_wants x WHERE x.item_id=i.id) AS wants,
      EXISTS(SELECT 1 FROM wishlist_wants x WHERE x.item_id=i.id AND x.user_id=?) AS wanted
     FROM wishlist_items i WHERE i.wishlist_id=? ORDER BY wants DESC, i.created_at`,
    [uid, w.id],
  );
  const stats = await first(
    c,
    `SELECT (SELECT COUNT(*) FROM wishlist_members WHERE wishlist_id=?) AS members,
      EXISTS(SELECT 1 FROM wishlist_members WHERE wishlist_id=? AND user_id=?) AS joined,
      (SELECT name FROM users WHERE id=?) AS creator,
      (SELECT name FROM users WHERE id=?) AS organizer`,
    [w.id, w.id, uid, w.creator_id, w.organizer_id],
  );
  return {
    id: w.id,
    title: w.title,
    store: w.store,
    pickupLocation: w.pickup_location,
    note: w.note,
    status: w.status,
    creatorName: stats.creator,
    mine: w.creator_id === uid,
    joined: !!stats.joined,
    memberCount: Number(stats.members),
    orderId: w.order_id,
    organizerName: stats.organizer ?? null,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      catalogKey: i.catalog_key,
      wants: Number(i.wants),
      wanted: !!i.wanted,
    })),
    createdAt: iso(w.created_at),
  };
}

const knownKey = (key: string | null) =>
  key && CATALOG.some((c) => c.key === key) ? key : null;

async function load(c: DB, wid: string, lock = false) {
  const w = await first(
    c,
    `SELECT * FROM wishlists WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [wid],
  );
  if (!w) fail(404, "NOT_FOUND", "This wishlist no longer exists.");
  return w;
}

async function notifyWishers(
  c: DB,
  w: any,
  message: string,
  key: string,
  except?: string,
) {
  for (const m of await rows(
    c,
    "SELECT user_id FROM wishlist_members WHERE wishlist_id=?",
    [w.id],
  ))
    if (m.user_id !== except)
      await notify(
        c,
        m.user_id,
        w.order_id ?? null,
        message,
        `${key}:${m.user_id}`,
      );
}

/** Link a new draft group to the wishlist it came from. */
export async function claimWishlist(
  c: DB,
  wid: string,
  orderId: string,
  uid: string,
  organizer: string,
) {
  const w = await load(c, wid, true);
  if (w.status !== "open")
    fail(409, "WISHLIST_TAKEN", "Someone is already organizing this wishlist.");
  await execute(
    c,
    "UPDATE wishlists SET status='claimed',order_id=?,organizer_id=? WHERE id=?",
    [orderId, uid, wid],
  );
  await notifyWishers(
    c,
    { ...w, order_id: null },
    `${organizer} is organizing “${w.title}”. You’ll be able to pick your shares once it’s published.`,
    `wish-claimed:${wid}`,
    uid,
  );
}

/** When a group made from a wishlist opens, tell everyone who wanted it. */
export async function wishlistPublished(c: DB, order: any) {
  const w = await first(c, "SELECT * FROM wishlists WHERE order_id=?", [
    order.id,
  ]);
  if (!w) return;
  await notifyWishers(
    c,
    w,
    `“${w.title}” is now a group: ${order.name}. Pick your shares before ${new Date(order.deadline).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver" })}.`,
    `wish-open:${w.id}`,
    order.organizer_id,
  );
}

export function wishlists(db: Pool) {
  const r = Router();
  r.use("/wishlists", verified);
  r.get("/wishlists", async (req, res) => {
    const scope = z
      .enum(["open", "mine"])
      .default("open")
      .parse(req.query.scope);
    const list = await rows(
      db,
      scope === "open"
        ? "SELECT * FROM wishlists WHERE status='open' ORDER BY created_at DESC LIMIT 100"
        : "SELECT w.* FROM wishlists w JOIN wishlist_members m ON m.wishlist_id=w.id WHERE m.user_id=? AND w.status<>'closed' ORDER BY w.created_at DESC",
      scope === "open" ? [] : [req.user!.id],
    );
    res.json(
      await Promise.all(list.map((w) => wishlistView(db, w, req.user!.id))),
    );
  });
  r.get("/wishlists/:id", async (req, res) => {
    res.json(
      await wishlistView(
        db,
        await load(db, req.params.id as string),
        req.user!.id,
      ),
    );
  });
  r.post("/wishlists", async (req, res) => {
    const b = wishlistInput.parse(req.body);
    const wid = id();
    await transaction(db, async (c) => {
      await execute(
        c,
        "INSERT INTO wishlists(id,creator_id,title,store,pickup_location,note) VALUES(?,?,?,?,?,?)",
        [wid, req.user!.id, b.title, b.store, b.pickupLocation, b.note],
      );
      await execute(
        c,
        "INSERT INTO wishlist_members(wishlist_id,user_id) VALUES(?,?)",
        [wid, req.user!.id],
      );
      const seen = new Set<string>();
      for (const item of b.items) {
        const key = item.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const iid = id();
        await execute(
          c,
          "INSERT INTO wishlist_items(id,wishlist_id,name,catalog_key,added_by) VALUES(?,?,?,?,?)",
          [iid, wid, item.name, knownKey(item.catalogKey), req.user!.id],
        );
        await execute(
          c,
          "INSERT INTO wishlist_wants(item_id,user_id) VALUES(?,?)",
          [iid, req.user!.id],
        );
      }
    });
    res.status(201).json({ id: wid });
  });
  // Join or leave. Leaving also removes your "I want this" marks.
  r.put("/wishlists/:id/join", async (req, res) => {
    const joined = z.boolean().parse(req.body.joined);
    await transaction(db, async (c) => {
      const w = await load(c, req.params.id as string, true);
      if (w.status !== "open")
        fail(409, "WISHLIST_TAKEN", "An organizer already picked this up.");
      if (joined) {
        await execute(
          c,
          "INSERT IGNORE INTO wishlist_members(wishlist_id,user_id) VALUES(?,?)",
          [w.id, req.user!.id],
        );
        if (w.creator_id !== req.user!.id)
          await notify(
            c,
            w.creator_id,
            null,
            `${req.user!.name} joined your wishlist “${w.title}”.`,
            `wish-join:${w.id}:${req.user!.id}`,
          );
      } else {
        if (w.creator_id === req.user!.id)
          fail(409, "CREATOR", "You started this wishlist. Delete it instead.");
        await execute(
          c,
          "DELETE x FROM wishlist_wants x JOIN wishlist_items i ON i.id=x.item_id WHERE i.wishlist_id=? AND x.user_id=?",
          [w.id, req.user!.id],
        );
        await execute(
          c,
          "DELETE FROM wishlist_members WHERE wishlist_id=? AND user_id=?",
          [w.id, req.user!.id],
        );
      }
    });
    res.json({ ok: true });
  });
  r.post("/wishlists/:id/items", async (req, res) => {
    const b = wishlistItemInput.parse(req.body);
    await transaction(db, async (c) => {
      const w = await load(c, req.params.id as string, true);
      if (w.status !== "open")
        fail(409, "WISHLIST_TAKEN", "An organizer already picked this up.");
      await execute(
        c,
        "INSERT IGNORE INTO wishlist_members(wishlist_id,user_id) VALUES(?,?)",
        [w.id, req.user!.id],
      );
      let item = await first(
        c,
        "SELECT id FROM wishlist_items WHERE wishlist_id=? AND name=?",
        [w.id, b.name],
      );
      if (!item) {
        const count = await first(
          c,
          "SELECT COUNT(*) AS n FROM wishlist_items WHERE wishlist_id=?",
          [w.id],
        );
        if (Number(count.n) >= 30) fail(409, "TOO_MANY", "This list is full.");
        item = { id: id() };
        await execute(
          c,
          "INSERT INTO wishlist_items(id,wishlist_id,name,catalog_key,added_by) VALUES(?,?,?,?,?)",
          [item.id, w.id, b.name, knownKey(b.catalogKey), req.user!.id],
        );
      }
      await execute(
        c,
        "INSERT IGNORE INTO wishlist_wants(item_id,user_id) VALUES(?,?)",
        [item.id, req.user!.id],
      );
    });
    res.status(201).json({ ok: true });
  });
  r.put("/wishlists/:id/items/:itemId/want", async (req, res) => {
    const wanted = z.boolean().parse(req.body.wanted);
    await transaction(db, async (c) => {
      const w = await load(c, req.params.id as string, true);
      if (w.status !== "open")
        fail(409, "WISHLIST_TAKEN", "An organizer already picked this up.");
      const item = await first(
        c,
        "SELECT id FROM wishlist_items WHERE id=? AND wishlist_id=?",
        [req.params.itemId, w.id],
      );
      if (!item) fail(404, "NOT_FOUND", "That item isn’t on this list.");
      if (wanted) {
        await execute(
          c,
          "INSERT IGNORE INTO wishlist_members(wishlist_id,user_id) VALUES(?,?)",
          [w.id, req.user!.id],
        );
        await execute(
          c,
          "INSERT IGNORE INTO wishlist_wants(item_id,user_id) VALUES(?,?)",
          [item.id, req.user!.id],
        );
      } else
        await execute(
          c,
          "DELETE FROM wishlist_wants WHERE item_id=? AND user_id=?",
          [item.id, req.user!.id],
        );
    });
    res.json({ ok: true });
  });
  r.delete("/wishlists/:id", async (req, res) => {
    await transaction(db, async (c) => {
      const w = await load(c, req.params.id as string, true);
      if (w.creator_id !== req.user!.id)
        fail(403, "FORBIDDEN", "Only the person who started it can delete it.");
      if (w.status !== "open")
        fail(409, "WISHLIST_TAKEN", "An organizer already picked this up.");
      await execute(c, "DELETE FROM wishlists WHERE id=?", [w.id]);
    });
    res.json({ ok: true });
  });
  return r;
}
