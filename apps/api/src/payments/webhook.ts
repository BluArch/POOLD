import express, { Router } from "express";
import type { Pool } from "mysql2/promise";
import { execute } from "../db.js";
import { stripeTestClient } from "./stripe-test.js";

/** This router must be mounted before JSON, browser-origin, and session middleware. */
export function stripeWebhook(db: Pool, production: boolean) {
  const r = Router();
  r.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req, res) => {
      if (production || process.env.PAYMENTS_TEST_MODE !== "true") {
        res
          .status(503)
          .json({
            error: {
              code: "PAYMENTS_DISABLED",
              message: "Test payments are disabled.",
            },
          });
        return;
      }
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const signature = req.header("stripe-signature");
      if (!secret || !signature || !Buffer.isBuffer(req.body)) {
        res
          .status(400)
          .json({
            error: {
              code: "WEBHOOK_SIGNATURE",
              message: "Missing Stripe signature.",
            },
          });
        return;
      }
      let event;
      try {
        event = stripeTestClient(production).webhooks.constructEvent(
          req.body,
          signature,
          secret,
        );
      } catch {
        res
          .status(400)
          .json({
            error: {
              code: "WEBHOOK_SIGNATURE",
              message: "Invalid Stripe signature.",
            },
          });
        return;
      }
      if (event.livemode) {
        res
          .status(400)
          .json({
            error: {
              code: "LIVE_EVENT_REJECTED",
              message: "Live payment events are disabled.",
            },
          });
        return;
      }
      const object = event.data.object as { id?: string };
      if (!object.id) {
        res
          .status(400)
          .json({
            error: {
              code: "WEBHOOK_OBJECT",
              message: "Stripe event has no object ID.",
            },
          });
        return;
      }
      await execute(
        db,
        `INSERT IGNORE INTO stripe_events(stripe_event_id,event_type,object_id,livemode,api_version)
      VALUES(?,?,?,?,?)`,
        [event.id, event.type, object.id, false, event.api_version ?? null],
      );
      res.json({ received: true });
    },
  );
  return r;
}
