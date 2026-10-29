import type { DB } from "./db.js";
import { rows, execute } from "./db.js";
import { id } from "./security.js";
export async function notify(
  db: DB,
  uid: string,
  oid: string | null,
  message: string,
  eventKey: string,
) {
  const nid = id();
  const r = await execute(
    db,
    "INSERT IGNORE INTO notifications(id,user_id,order_id,message,event_key) VALUES(?,?,?,?,?)",
    [nid, uid, oid, message, eventKey],
  );
  if (r.affectedRows)
    await execute(
      db,
      "INSERT INTO push_deliveries(notification_id) VALUES(?)",
      [nid],
    );
}
export async function notifyMembers(
  db: DB,
  oid: string,
  message: string,
  eventKey: string,
) {
  for (const m of await rows(
    db,
    "SELECT user_id FROM memberships WHERE order_id=?",
    [oid],
  ))
    await notify(db, m.user_id, oid, message, eventKey);
}
