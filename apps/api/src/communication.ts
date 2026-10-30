import { Router } from "express";
import { z } from "zod";
import type { Pool } from "mysql2/promise";
import { rateLimit } from "express-rate-limit";
import { verified } from "./auth.js";
import { first, rows, execute, transaction, iso } from "./db.js";
import { id } from "./security.js";
import { getOrder, owner } from "./order-model.js";
import { notify } from "./notifications.js";
import { fail, RATE_LIMIT_ERROR } from "./errors.js";
import { requestInput } from "@poold/contracts";
import type { Mail, MailSender } from "./mail.js";
export function communication(db: Pool, sendMail: MailSender, appUrl: string) {
  const r = Router();
  const target = (fallback: number) =>
    process.env.REQUEST_INTEREST_TARGET
      ? z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .parse(process.env.REQUEST_INTEREST_TARGET)
      : fallback;
  const normalize = (name: string) =>
    name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  const listRequests = async (uid: string, orderId: string | null) =>
    (
      await rows(
        db,
        `SELECT pr.id,pr.name,pr.note,pr.order_id AS orderId,pr.status,u.name AS creatorName,(pr.creator_id=?) AS mine,(SELECT COUNT(*) FROM request_votes WHERE request_id=pr.id) AS votes,EXISTS(SELECT 1 FROM request_votes WHERE request_id=pr.id AND user_id=?) AS voted,c.interest_target AS target FROM product_requests pr JOIN communities c ON c.id=pr.community_id JOIN users u ON u.id=pr.creator_id WHERE ${orderId ? "pr.order_id=?" : "pr.order_id IS NULL"} ORDER BY pr.status='open' DESC,votes DESC,pr.created_at DESC LIMIT 100`,
        orderId ? [uid, uid, orderId] : [uid, uid],
      )
    ).map((x) => ({
      ...x,
      votes: Number(x.votes),
      target: target(x.target),
      voted: !!x.voted,
      mine: !!x.mine,
    }));
  const createRequest = async (
    uid: string,
    body: unknown,
    orderId: string | null,
    onCreated?: (c: any, rid: string, name: string) => Promise<void>,
  ) => {
    const b = requestInput.parse(body);
    const rid = id();
    await transaction(db, async (c) => {
      await execute(
        c,
        "INSERT INTO product_requests(id,creator_id,name,normalized_name,note,order_id) VALUES(?,?,?,?,?,?)",
        [rid, uid, b.name, normalize(b.name), b.note, orderId],
      );
      await execute(c, "INSERT INTO request_votes VALUES(?,?)", [rid, uid]);
      await onCreated?.(c, rid, b.name);
    });
    return rid;
  };
  /** Loads a request the signed-in user created, for editing or deleting. */
  const ownRequest = async (c: any, rid: string, uid: string) => {
    const pr = await first(
      c,
      "SELECT * FROM product_requests WHERE id=? FOR UPDATE",
      [rid],
    );
    if (!pr) fail(404, "NOT_FOUND", "Request not found.");
    if (pr.creator_id !== uid)
      fail(403, "NOT_YOURS", "You can only change requests you created.");
    if (pr.status !== "open")
      fail(
        409,
        "REQUEST_CLOSED",
        "The organizer already responded to this request.",
      );
    return pr;
  };

  r.get("/requests", verified, async (req, res) => {
    res.json(await listRequests(req.user!.id, null));
  });
  r.post("/requests", verified, async (req, res) => {
    res
      .status(201)
      .json({ id: await createRequest(req.user!.id, req.body, null) });
  });
  r.patch("/requests/:id", verified, async (req, res) => {
    const b = requestInput.parse(req.body);
    await transaction(db, async (c) => {
      await ownRequest(c, req.params.id as string, req.user!.id);
      await execute(
        c,
        "UPDATE product_requests SET name=?,normalized_name=?,note=? WHERE id=?",
        [b.name, normalize(b.name), b.note, req.params.id],
      );
    });
    res.json({ ok: true });
  });
  r.delete("/requests/:id", verified, async (req, res) => {
    await transaction(db, async (c) => {
      await ownRequest(c, req.params.id as string, req.user!.id);
      await execute(c, "DELETE FROM product_requests WHERE id=?", [
        req.params.id,
      ]);
    });
    res.json({ ok: true });
  });

  /* Requests inside one group, while it is still collecting shares. */
  r.get("/orders/:id/requests", verified, async (req, res) => {
    const o = await getOrder(
      db,
      req.params.id as string,
      req.user!.id,
      typeof req.query.invite === "string" ? req.query.invite : undefined,
    );
    res.json(await listRequests(req.user!.id, o.id));
  });
  r.post("/orders/:id/requests", verified, async (req, res) => {
    const o = await getOrder(
      db,
      req.params.id as string,
      req.user!.id,
      typeof req.query.invite === "string" ? req.query.invite : undefined,
    );
    if (o.organizer_id === req.user!.id)
      fail(
        409,
        "ORGANIZER_ADDS_ITEMS",
        "As the organizer, add the item to the group instead.",
      );
    if (o.status !== "open" || new Date(o.deadline).getTime() <= Date.now())
      fail(409, "GROUP_CLOSED", "This group is no longer taking requests.");
    const rid = await createRequest(
      req.user!.id,
      req.body,
      o.id,
      async (c, rid, name) =>
        notify(
          c,
          o.organizer_id,
          o.id,
          `${req.user!.name} asked for ${name} in ${o.name}.`,
          `request:${rid}`,
        ),
    );
    res.status(201).json({ id: rid });
  });
  r.post("/orders/:id/requests/:rid/decline", verified, async (req, res) => {
    await transaction(db, async (c) => {
      const o = await getOrder(
        c,
        req.params.id as string,
        req.user!.id,
        undefined,
        true,
      );
      owner(o, req.user!.id);
      const pr = await first(
        c,
        "SELECT * FROM product_requests WHERE id=? AND order_id=? FOR UPDATE",
        [req.params.rid, o.id],
      );
      if (!pr) fail(404, "NOT_FOUND", "Request not found.");
      await execute(
        c,
        "UPDATE product_requests SET status='declined' WHERE id=?",
        [pr.id],
      );
      await notify(
        c,
        pr.creator_id,
        o.id,
        `${pr.name} won’t be added to ${o.name} this time.`,
        `request-declined:${pr.id}`,
      );
    });
    res.json({ ok: true });
  });
  r.put("/requests/:id/vote", verified, async (req, res) => {
    const voted = z.boolean().parse(req.body.voted);
    await transaction(db, async (c) => {
      if (
        !(await first(
          c,
          "SELECT id FROM product_requests WHERE id=? FOR UPDATE",
          [req.params.id],
        ))
      )
        fail(404, "NOT_FOUND", "Request not found.");
      if (voted)
        await execute(c, "INSERT IGNORE INTO request_votes VALUES(?,?)", [
          req.params.id,
          req.user!.id,
        ]);
      else
        await execute(
          c,
          "DELETE FROM request_votes WHERE request_id=? AND user_id=?",
          [req.params.id, req.user!.id],
        );
    });
    res.json({ ok: true });
  });
  r.get("/notifications", verified, async (req, res) =>
    res.json(
      (
        await rows(
          db,
          "SELECT id,order_id AS orderId,message,seen,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
          [req.user!.id],
        )
      ).map((n) => ({ ...n, seen: !!n.seen, createdAt: iso(n.createdAt) })),
    ),
  );
  r.post("/notifications/read", verified, async (req, res) => {
    await execute(db, "UPDATE notifications SET seen=TRUE WHERE user_id=?", [
      req.user!.id,
    ]);
    res.json({ ok: true });
  });
  r.post(
    "/orders/:id/invite",
    verified,
    rateLimit({
      windowMs: 60000,
      limit: 15,
      legacyHeaders: false,
      message: RATE_LIMIT_ERROR,
    }),
    async (req, res) => {
      const email = z.email().max(254).parse(req.body.email).toLowerCase();
      let mail: Mail | null = null;
      await transaction(db, async (c) => {
        const o = await getOrder(
          c,
          req.params.id as string,
          req.user!.id,
          undefined,
          true,
        );
        owner(o, req.user!.id);
        if (o.status !== "open" || new Date(o.deadline).getTime() <= Date.now())
          fail(409, "INVITES_CLOSED", "Invites close when claims close.");
        const u = await first(c, "SELECT id FROM users WHERE email=?", [email]);
        if (u) {
          await execute(c, "INSERT IGNORE INTO order_invitations VALUES(?,?)", [
            o.id,
            u.id,
          ]);
          await notify(
            c,
            u.id,
            o.id,
            `${req.user!.name} invited you to ${o.name}.`,
            `invite:${o.id}:${u.id}`,
          );
        } else
          mail = {
            to: email,
            subject: `Join ${o.name} on POOLD`,
            text: `${req.user!.name} invited you. Sign in or create an account, then open: ${appUrl}/order/${o.id}?invite=${o.invite_token}`,
          };
      });
      if (mail) await sendMail(mail);
      res.json({
        ok: true,
        message:
          "Invitation prepared. Existing accounts receive an in-app update; new accounts receive an email invite.",
      });
    },
  );
  r.put("/devices", verified, async (req, res) => {
    const b = z
      .object({
        token: z.string().min(20).max(512),
        platform: z.enum(["android", "ios"]),
      })
      .parse(req.body);
    await execute(
      db,
      `INSERT INTO device_tokens(token,user_id,platform) VALUES(?,?,?) ON DUPLICATE KEY UPDATE user_id=?,platform=?,updated_at=UTC_TIMESTAMP(3)`,
      [b.token, req.user!.id, b.platform, req.user!.id, b.platform],
    );
    res.json({ ok: true });
  });
  r.delete("/devices", verified, async (req, res) => {
    const raw = z.string().min(20).max(512).parse(req.body.token);
    await execute(db, "DELETE FROM device_tokens WHERE token=? AND user_id=?", [
      raw,
      req.user!.id,
    ]);
    res.json({ ok: true });
  });
  return r;
}
