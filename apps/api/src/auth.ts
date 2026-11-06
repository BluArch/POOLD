import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import type { Pool } from "mysql2/promise";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import {
  registerInput,
  emailCodeInput,
  loginInput,
  profileInput,
  isUvicEmail,
  forgotPasswordInput,
  resetPasswordInput,
  type User,
} from "@poold/contracts";
import { first, execute } from "./db.js";
import { organizerRating } from "./order-model.js";
import { fail } from "./errors.js";
import { id, token, hash, passwordHash, passwordMatches } from "./security.js";
import type { MailSender } from "./mail.js";
import {
  issueVerification,
  confirmVerification,
  verificationStatus,
} from "./verification.js";
import { issueReset, confirmReset, RESET_SENT } from "./password-reset.js";
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
  const marks = await first(
    db,
    "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM no_shows WHERE user_id=? AND created_at > UTC_TIMESTAMP(3) - INTERVAL 90 DAY",
    [uid],
  );
  const noShows = Number(marks.n);
  const until =
    noShows >= NO_SHOW_LIMIT && marks.last
      ? new Date(new Date(marks.last).getTime() + 30 * 86400000)
      : null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    verified: !!u.verified,
    university: !!u.verified && u.email.endsWith("@uvic.ca"),
    photo: u.photo,
    demo: !!u.demo,
    completed: Number(u.completed),
    rating: await organizerRating(db, uid),
    noShows,
    blockedUntil:
      until && until.getTime() > Date.now() ? until.toISOString() : null,
  };
}
/** Missed pickups in 90 days that block joining for 30 days. */
export const NO_SHOW_LIMIT = 3;

/** Ordinary hosted sign-in remains UVic-only; Maya uses the explicit demo route. */
export const allowedEmail = (email: string, production: boolean) =>
  isUvicEmail(email) ||
  (!production && email.toLowerCase().endsWith("@demo.poold.invalid"));

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
  // Limits are per person, not per network, so a whole class on the same
  // campus Wi-Fi isn't locked out by each other.
  const message = (text: string) => ({
    error: { code: "RATE_LIMIT", message: text },
  });
  const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");
  const network = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 400,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: ip,
    message: message(
      "Too many sign-in attempts from this network. Try again in 15 minutes.",
    ),
  });
  const perEmail = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${ip(req)}|${String(req.body?.email ?? "")
        .trim()
        .toLowerCase()}`,
    message: message(
      "Too many attempts for this email. Try again in 15 minutes.",
    ),
  });
  const perUser = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? ip(req),
    message: message("Too many attempts. Try again in 15 minutes."),
  });
  const limit = [network, perEmail];
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
        const user = await publicUser(db, s.user_id);
        if (!user.demo || options.demo) {
          req.user = user;
          req.sessionHash = hash(raw);
        }
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
  router.post("/auth/register", ...limit, async (req, res) => {
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
    res.status(201).json({
      ...(await session(req, res, uid)),
      verification,
      message: verification.message,
    });
  });
  router.get("/auth/verification", requireUser, async (req, res) =>
    res.json(await verificationStatus(db, req.user!.id)),
  );
  router.post(
    "/auth/verify",
    network,
    requireUser,
    perUser,
    async (req, res) => {
      const b = emailCodeInput.parse(req.body);
      await confirmVerification(
        db,
        req.user!.id,
        b.code,
        otpSecret,
        req.sessionHash,
      );
      res.json(await session(req, res, req.user!.id));
    },
  );
  router.post("/auth/login", ...limit, async (req, res) => {
    const b = loginInput.parse(req.body);
    if (!allowedEmail(b.email, options.production))
      fail(
        403,
        "UVIC_ONLY",
        "POOLD is for UVic students. Sign in with your @uvic.ca email.",
      );
    const u = await first(db, "SELECT * FROM users WHERE email=?", [b.email]);
    const encoded = u?.password_hash ?? (await passwordHash("dummy-password"));
    const matches = await passwordMatches(b.password, encoded);
    if (!u || !matches || (options.production && u.demo))
      fail(401, "INVALID_LOGIN", "Email or password is incorrect.");
    res.json(await session(req, res, u.id));
  });
  router.post(
    "/auth/resend",
    network,
    requireUser,
    perUser,
    async (req, res) => {
      const verification = await issueVerification(
        db,
        req.user!.id,
        otpSecret,
        options.sendMail,
      );
      if (verification.delivery === "failed")
        fail(502, "EMAIL_DELIVERY_FAILED", verification.message);
      res.json(verification);
    },
  );
  router.post("/auth/forgot", ...limit, async (req, res) => {
    const b = forgotPasswordInput.parse(req.body);
    await issueReset(db, b.email, otpSecret, options.sendMail);
    res.json({ message: RESET_SENT });
  });
  router.post("/auth/reset", ...limit, async (req, res) => {
    const b = resetPasswordInput.parse(req.body);
    const uid = await confirmReset(db, b.email, b.code, b.password, otpSecret);
    res.json(await session(req, res, uid));
  });
  if (options.demo)
    router.post("/auth/demo", network, async (req, res) => {
      const uid = z.literal("demo-maya").parse(req.body.userId);
      if (
        !(await first(db, "SELECT id FROM users WHERE id=? AND demo=TRUE", [
          uid,
        ]))
      )
        fail(404, "NO_DEMO", "The demo account is not ready yet.");
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
