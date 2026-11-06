import type { Pool } from "mysql2/promise";
import { rows } from "../db.js";
export async function assertPaymentSchema(db: Pool) {
  const required = [
    "012_scheduled_payments.sql",
    "013_payment_recovery_accounting.sql",
    "014_payment_reserves.sql",
    "015_organizer_advance_recovery.sql",
  ];
  try {
    const applied = await rows(
      db,
      "SELECT version FROM schema_migrations WHERE version IN (?,?,?,?)",
      required,
    );
    if (applied.length !== required.length) throw new Error("missing");
  } catch {
    throw new Error(
      "Scheduled-payment schema is missing. Run npm run db:migrate before starting the API or financial worker (migrations 012–015).",
    );
  }
}
