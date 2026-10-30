import express from "express";
import cors from "cors";
import helmet from "helmet";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { rateLimit } from "express-rate-limit";
import type { Pool } from "mysql2/promise";
import { verificationSecret } from "./verification.js";
import { auth } from "./auth.js";
import { mailer, type MailSender } from "./mail.js";
import { communication } from "./communication.js";
import { fulfillment } from "./fulfillment.js";
import { claims } from "./claims.js";
import { orders } from "./orders.js";
import { errorHandler, RATE_LIMIT_ERROR } from "./errors.js";
export function createApp(
  db: Pool,
  options: {
    production?: boolean;
    demo?: boolean;
    otpSecret?: string;
    origin?: string;
    sendMail?: MailSender;
  } = {},
) {
  const production =
      options.production ?? process.env.NODE_ENV === "production",
    demo = !production && (options.demo ?? process.env.DEMO_ENABLED === "true");
  const origin =
    options.origin ??
    process.env.APP_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL ??
    "http://localhost:8081";
  const sendMail = options.sendMail ?? mailer(production);
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY_HOPS) {
    const hops = Number(process.env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 1 || hops > 5)
      throw new Error("TRUST_PROXY_HOPS must be an integer from 1 to 5.");
    app.set("trust proxy", hops);
  }
  app.use(helmet());
  app.use(cors({ origin, credentials: true }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({
        error: { code: "ORIGIN", message: "Request origin is not allowed." },
      });
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
        "application/json"
    ) {
      res.status(415).json({
        error: {
          code: "CONTENT_TYPE",
          message: "Send requests as application/json.",
        },
      });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      message: RATE_LIMIT_ERROR,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/api/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true, database: "mysql" });
  });
  app.use(
    "/api",
    auth(db, {
      production,
      demo,
      otpSecret: options.otpSecret ?? verificationSecret(production),
      sendMail,
    }),
  );
  app.use(
    "/api",
    communication(db, sendMail, process.env.PUBLIC_APP_URL ?? origin),
  );
  app.use("/api", fulfillment(db));
  app.use("/api", claims(db));
  app.use("/api", orders(db));
  if (demo)
    app.get("/api/dev/outbox", async (_req, res) => {
      try {
        const raw = await readFile(
          process.env.EMAIL_OUTBOX || "../../.local/mail-outbox.jsonl",
          "utf8",
        );
        res.json(
          raw
            .trim()
            .split("\n")
            .filter(Boolean)
            .slice(-20)
            .map((s) => JSON.parse(s)),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") res.json([]);
        else throw e;
      }
    });
  app.use("/api", (_req, res) =>
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "This endpoint does not exist." },
    }),
  );
  if (process.env.STATIC_WEB_DIR) {
    const webDir = resolve(process.env.STATIC_WEB_DIR);
    const index = resolve(webDir, "index.html");
    if (!existsSync(index))
      throw new Error("Build the web app before setting STATIC_WEB_DIR.");
    app.use(express.static(webDir, { index: false }));
    app.get("/{*path}", (req, res, next) => {
      // Missing assets must not return HTML in place of JavaScript or images.
      if (req.path.startsWith("/_expo/") || req.path.startsWith("/assets/"))
        return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(index);
    });
  }
  app.use(errorHandler);
  return app;
}
