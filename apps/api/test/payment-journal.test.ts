import test from "node:test";
import assert from "node:assert/strict";
import { database, execute, rows, transaction } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { postJournal } from "../src/payments/journal.js";
import { id } from "../src/security.js";

test("financial journal rejects imbalance and posts each balanced event once", async () => {
  assert.ok(process.env.TEST_DATABASE_URL?.endsWith("/poold_test"));
  const db = database(process.env.TEST_DATABASE_URL);
  const eventKey = `test:${id()}`;
  try {
    await migrate(db);
    await assert.rejects(() => transaction(db, (c) => postJournal(c, eventKey, "Invalid entry", [
      { account: "cash", debitCents: 100 }, { account: "liability", creditCents: 99 },
    ])), /balance/);
    const lines = [{ account: "cash", debitCents: 100 }, { account: "grocery_liability", creditCents: 100 }];
    assert.equal(await transaction(db, (c) => postJournal(c, eventKey, "Test capture", lines)), true);
    assert.equal(await transaction(db, (c) => postJournal(c, eventKey, "Test capture", lines)), false);
    const stored = await rows(db, "SELECT l.debit_cents,l.credit_cents FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.event_key=? ORDER BY l.line_no", [eventKey]);
    assert.equal(stored.length, 2);
    assert.equal(stored[0].debit_cents, 100);
    assert.equal(stored[1].credit_cents, 100);
  } finally {
    await execute(db, "DELETE l FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE e.event_key=?", [eventKey]);
    await execute(db, "DELETE FROM journal_entries WHERE event_key=?", [eventKey]);
    await db.end();
  }
});
