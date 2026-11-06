import type { PoolConnection } from "mysql2/promise";
import { execute } from "../db.js";
import { id } from "../security.js";

export type JournalLine = {
  account: string;
  debitCents?: number;
  creditCents?: number;
};

/** Call inside the same transaction that records the provider/business state. */
export async function postJournal(
  db: PoolConnection,
  eventKey: string,
  description: string,
  lines: JournalLine[],
) {
  const valid = (n: number) =>
    Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000;
  if (
    !eventKey ||
    eventKey.length > 180 ||
    !description ||
    description.length > 240 ||
    lines.length < 2
  )
    throw new Error(
      "Journal entry needs a bounded key, description, and two lines.",
    );
  let debit = 0,
    credit = 0;
  for (const line of lines) {
    const d = line.debitCents ?? 0,
      c = line.creditCents ?? 0;
    if (
      !line.account ||
      line.account.length > 80 ||
      !valid(d) ||
      !valid(c) ||
      d > 0 === c > 0
    )
      throw new Error(
        "Journal lines must have one positive side and a valid account.",
      );
    debit += d;
    credit += c;
  }
  if (!valid(debit) || debit !== credit)
    throw new Error("Journal entry must balance to the cent.");
  const entryId = id();
  const inserted = await execute(
    db,
    "INSERT IGNORE INTO journal_entries(id,event_key,description,currency) VALUES(?,?,?,'CAD')",
    [entryId, eventKey, description],
  );
  if (!inserted.affectedRows) return false;
  for (let i = 0; i < lines.length; i++)
    await execute(
      db,
      "INSERT INTO journal_lines(entry_id,line_no,account,debit_cents,credit_cents) VALUES(?,?,?,?,?)",
      [
        entryId,
        i + 1,
        lines[i].account,
        lines[i].debitCents ?? 0,
        lines[i].creditCents ?? 0,
      ],
    );
  return true;
}
