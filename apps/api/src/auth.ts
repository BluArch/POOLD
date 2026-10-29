import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import type { Pool } from "mysql2/promise";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  registerInput,
  emailCodeInput,
  loginInput,
  profileInput,
  type User,
} from "@poold/contracts";
import { first, execute } from "./db.js";
import { fail } from "./errors.js";
import { id, token, hash, passwordHash, passwordMatches } from "./security.js";
import type { MailSender } from "./mail.js";
import {
  issueVerification,
  confirmVerification,
  verificationStatus,
} from "./verification.js";
declare module "express-serve-static-core" {
  interface Request {
    user?: User;
    sessionHash?: string;
  }
}
export async function publicUser(db: Pool, uid: string): Promise<User> {
  const u = await first(
    db,
    `SELECT u.*,(SELECT COUNT(*) FROM memberships m JOIN orders o ON o.id=m.order_id WHERE m.user_id=u.id AND (m.collected_at IS NOT NULL OR o.organizer_id=u.id) AND o.status='completed') AS completed FROM users u WHERE u.id=?`,
    [uid],
  );
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    verified: !!u.verified,
    university: !!u.verified && u.email.endsWith("@uvic.ca"),
    photo: u.photo,
    demo: !!u.demo,
    completed: Number(u.completed),
  };
}
export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) fail(401, "SIGN_IN", "Please sign in to continue.");
  next();
};
export const verified: RequestHandler = (req, _res, next) => {
  if (!req.user) fail(401, "SIGN_IN", "Please sign in to continue.");
  if (!req.user.verified)
    fail(
      403,
      "VERIFY_EMAIL",
      "Verify your email before joining or organizing.",
    );
  next();
};
export function auth(
  db: Pool,
  options: {
    production: boolean;
    demo: boolean;
    otpSecret: string;
    sendMail: MailSender;
  },
) {
  const router = Router();
  const otpSecret = options.otpSecret;
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Too many attempts. Please retry in 15 minutes.",
      },
    },
  });
  router.use(async (req, _res, next) => {
    const raw = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : req.headers.cookie
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("poold_session="))
          ?.slice(14);
    if (raw) {
      const s = await first(
        db,
        "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3)",
        [hash(raw)],
      );
      if (s) {
        req.user = await publicUser(db, s.user_id);
        req.sessionHash = hash(raw);
      }
    }
    next();
  });
  async function session(req: Request, res: Response, uid: string) {
    const raw = token();
    await execute(db, "INSERT INTO sessions VALUES(?,?,?)", [
      hash(raw),
      uid,
      new Date(Date.now() + 7 * 86400000),
    ]);
    res.cookie("poold_session", raw, {
      httpOnly: true,
      sameSite: "strict",
      secure: options.production,
      maxAge: 7 * 86400000,
      path: "/api",
    });
    return {
      user: await publicUser(db, uid),
      ...(req.body.native ? { token: raw } : {}),
    };
  }
  router.get("/session", (req, res) =>
    res.json({ user: req.user ?? null, demoEnabled: options.demo }),
  );
  router.post("/auth/register", limit, async (req, res) => {
    const b = registerInput.parse(req.body),
      uid = id(),
      encoded = await passwordHash(b.password);
    await execute(
      db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [uid, b.email, b.name, encoded],
    );
    const verification = await issueVerification(
      db,
      uid,
      otpSecret,
      options.sendMail,
    );
    res
      .status(201)
      .json({
        ...(await session(req, res, uid)),
        verification,
        message: verification.message,
      });
  });
  router.get("/auth/verification", requireUser, async (req, res) =>
    res.json(await verificationStatus(db, req.user!.id)),
  );
  router.post("/auth/verify", limit, requireUser, async (req, res) => {
    const b = emailCodeInput.parse(req.body);
    await confirmVerification(
      db,
      req.user!.id,
      b.code,
      otpSecret,
      req.sessionHash,
    );
    res.json(await session(req, res, req.user!.id));
  });
  router.post("/auth/login", limit, async (req, res) => {
    const b = loginInput.parse(req.body),
      u = await first(db, "SELECT * FROM users WHERE email=?", [b.email]);
    const encoded = u?.password_hash ?? (await passwordHash("dummy-password"));
    const matches = await passwordMatches(b.password, encoded);
    if (!u || !matches || (options.production && u.demo))
      fail(401, "INVALID_LOGIN", "Email or password is incorrect.");
    res.json(await session(req, res, u.id));
  });
  router.post("/auth/resend", limit, requireUser, async (req, res) => {
    const verification = await issueVerification(
      db,
      req.user!.id,
      otpSecret,
      options.sendMail,
    );
    if (verification.delivery === "failed")
      fail(502, "EMAIL_DELIVERY_FAILED", verification.message);
    res.json(verification);
  });
  if (options.demo)
    router.post("/auth/demo", limit, async (req, res) => {
      const uid = z.literal("demo-maya").parse(req.body.userId);
      if (
        !(await first(db, "SELECT id FROM users WHERE id=? AND demo=TRUE", [
          uid,
        ]))
      )
        fail(404, "NO_DEMO", "Run the development seed first.");
      res.json(await session(req, res, uid));
    });
  router.post("/auth/logout", async (req, res) => {
    if (req.sessionHash)
      await execute(db, "DELETE FROM sessions WHERE token_hash=?", [
        req.sessionHash,
      ]);
    res.clearCookie("poold_session", {
      path: "/api",
      httpOnly: true,
      sameSite: "strict",
      secure: options.production,
    });
    res.json({ ok: true });
  });
  router.get("/profile", requireUser, (req, res) => res.json(req.user));
  router.patch("/profile", requireUser, async (req, res) => {
    const b = profileInput.parse(req.body);
    await execute(db, "UPDATE users SET name=?,photo=? WHERE id=?", [
      b.name,
      b.photo,
      req.user!.id,
    ]);
    res.json(await publicUser(db, req.user!.id));
  });
  return router;
}
