import type { Pool } from "mysql2/promise";
import { transaction, rows, first, execute } from "./db.js";
import { notifyMembers } from "./notifications.js";
import { settleAll, dropUnpaid, releaseRemaining } from "./payments.js";
import { markNoShow, GRACE_MS } from "./fulfillment.js";
export async function runJobs(db: Pool, now = new Date()) {
  const candidates = await rows(
    db,
    "SELECT id FROM orders WHERE status IN('open','locked','shopping','ready')",
  );
  let events = 0;
  for (const { id } of candidates)
    await transaction(db, async (c) => {
      const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
        id,
      ]);
      if (!o || !["open", "locked", "shopping", "ready"].includes(o.status))
        return;
      const deadline = new Date(o.deadline).getTime(),
        pickup = new Date(o.pickup_at).getTime(),
        time = now.getTime();
      const once = async (key: string, message: string) => {
        const result = await execute(
          c,
          "INSERT IGNORE INTO job_executions(job_key) VALUES(?)",
          [key],
        );
        if (result.affectedRows) {
          await notifyMembers(c, o.id, message, key);
          events++;
        }
      };
      const graceOver = time > new Date(o.pickup_end).getTime() + GRACE_MS;
      // Organizer no-show: never got to pickup by the end of the grace period.
      // Cancel, refund everyone, and record it against the organizer.
      if (["open", "locked", "shopping"].includes(o.status) && graceOver) {
        await execute(c, "UPDATE orders SET status='cancelled' WHERE id=?", [
          o.id,
        ]);
        await execute(c, "DELETE FROM collection_tokens WHERE order_id=?", [
          o.id,
        ]);
        await settleAll(c, o, "the organizer didn’t complete the run", true);
        await execute(
          c,
          "INSERT IGNORE INTO no_shows(id,user_id,order_id,role) VALUES(UUID(),?,?,'organizer')",
          [o.organizer_id, o.id],
        );
        await once(
          `organizer-no-show:${o.id}`,
          `${o.name} was cancelled because the organizer didn’t complete the run. Everyone was refunded in full.`,
        );
        return;
      }
      // Buyer no-shows: the 24-hour hold is over. Mark them and finish.
      if (o.status === "ready" && graceOver) {
        const waiting = await rows(
          c,
          "SELECT user_id FROM memberships WHERE order_id=? AND collected_at IS NULL AND no_show_at IS NULL AND user_id<>?",
          [o.id, o.organizer_id],
        );
        for (const m of waiting) await markNoShow(c, o, m.user_id);
        await execute(c, "UPDATE orders SET status='completed' WHERE id=?", [
          o.id,
        ]);
        await releaseRemaining(c, o);
        events++;
        return;
      }
      if (o.status === "open" && deadline <= time) {
        await dropUnpaid(c, o);
        await execute(c, "UPDATE orders SET status='locked' WHERE id=?", [
          o.id,
        ]);
        await once(
          `deadline-close:${o.id}`,
          `${o.name}: the deadline passed. Shares are now locked.`,
        );
      } else if (o.status === "open" && deadline - time <= 24 * 3600000)
        await once(
          `deadline-reminder:${o.id}`,
          `${o.name}: shares close within 24 hours. Review your quantities and pickup time.`,
        );
      if (pickup > time && pickup - time <= 2 * 3600000)
        await once(
          `pickup-reminder:${o.id}`,
          `${o.name}: pickup is within 2 hours at ${o.pickup_location}. ${o.status === "ready" ? "Your code is in My Orders." : "Wait for the organizer to mark bags ready."}`,
        );
    });
  await execute(db, "DELETE FROM sessions WHERE expires_at<?", [now]);
  await execute(
    db,
    "DELETE FROM email_verifications WHERE expires_at<? AND resend_at<=?",
    [now, now],
  );
  return { events };
}
