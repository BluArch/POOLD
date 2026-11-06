import type { Pool } from "mysql2/promise";
import { first, transaction } from "../db.js";
import { prepareClose } from "./engine.js";
export async function prepareCloseBatch(
  db: Pool,
  orderId: string,
  now = new Date(),
) {
  return transaction(db, async (c) => {
    const o = await first(c, "SELECT * FROM orders WHERE id=? FOR UPDATE", [
      orderId,
    ]);
    await prepareClose(c, o, now);
    return first(c, "SELECT * FROM funding_batches WHERE order_id=?", [
      orderId,
    ]);
  });
}
