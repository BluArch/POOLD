import type { Pool } from "mysql2/promise";
import { applicationDefault, initializeApp, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { rows, first, execute, transaction } from "./db.js";
export type PushSender = (
  tokens: string[],
  message: string,
  orderId: string | null,
) => Promise<{ invalidTokens: string[]; retryableFailure?: boolean }>;
export function firebaseSender(): PushSender | null {
  if (process.env.FCM_ENABLED !== "true") return null;
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  return async (tokens, message, orderId) => {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: "POOLD update", body: message },
      data: orderId ? { orderId } : {},
      android: { notification: { channelId: "orders" } },
    });
    return {
      retryableFailure: response.responses.some(
        (r) =>
          !r.success &&
          ![
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
          ].includes(r.error?.code ?? ""),
      ),
      invalidTokens: response.responses.flatMap((r, n) =>
        !r.success &&
        [
          "messaging/registration-token-not-registered",
          "messaging/invalid-registration-token",
        ].includes(r.error?.code ?? "")
          ? [tokens[n]]
          : [],
      ),
    };
  };
}
export async function dispatchPush(db: Pool, send: PushSender | null) {
  if (!send) return { sent: 0, configured: false };
  let sent = 0;
  for (let n = 0; n < 50; n++) {
    const job = await transaction(db, async (c) => {
      const j = await first(
        c,
        `SELECT p.*,n.message,n.user_id,n.order_id FROM push_deliveries p JOIN notifications n ON n.id=p.notification_id WHERE (p.status='pending' OR (p.status='sending' AND p.locked_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))) AND p.attempts<5 ORDER BY n.created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      if (!j) return null;
      await execute(
        c,
        "UPDATE push_deliveries SET status='sending',locked_at=UTC_TIMESTAMP(3),attempts=attempts+1 WHERE notification_id=?",
        [j.notification_id],
      );
      return j;
    });
    if (!job) break;
    try {
      const devices = await rows(
        db,
        "SELECT token FROM device_tokens WHERE user_id=?",
        [job.user_id],
      );
      if (devices.length) {
        const result = await send(
          devices.map((d) => d.token),
          job.message,
          job.order_id,
        );
        for (const t of result.invalidTokens)
          await execute(db, "DELETE FROM device_tokens WHERE token=?", [t]);
        if (result.retryableFailure)
          throw new Error("FCM rejected one or more deliveries temporarily.");
      }
      await execute(
        db,
        "UPDATE push_deliveries SET status='sent' WHERE notification_id=?",
        [job.notification_id],
      );
      sent++;
    } catch (e) {
      await execute(
        db,
        "UPDATE push_deliveries SET status='pending' WHERE notification_id=?",
        [job.notification_id],
      );
      console.error("Push attempt failed:", (e as Error).message);
      break;
    }
  }
  return { sent, configured: true };
}
