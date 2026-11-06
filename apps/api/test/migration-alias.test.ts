import test from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { migrate, catalogueMigrationAliases } from "../src/migrate.js";
import { first, execute, rows } from "../src/db.js";

test("canonical catalogue names adopt identical legacy migrations without reapplying DDL or changing history", async () => {
  const h = await setup();
  const added: string[] = [];
  try {
    const before = await rows(
      h.db,
      "SELECT id,revision,price_cents FROM store_offers ORDER BY id LIMIT 5",
    );
    for (const [canonical, legacy] of Object.entries(
      catalogueMigrationAliases,
    )) {
      if (
        !(await first(
          h.db,
          "SELECT version FROM schema_migrations WHERE version=?",
          [legacy.version],
        ))
      ) {
        await execute(
          h.db,
          "INSERT INTO schema_migrations(version,applied_at) SELECT ?,applied_at FROM schema_migrations WHERE version=?",
          [legacy.version, canonical],
        );
        added.push(legacy.version);
      }
      await execute(h.db, "DELETE FROM schema_migrations WHERE version=?", [
        canonical,
      ]);
    }
    await migrate(h.db);
    await migrate(h.db);
    for (const [canonical, legacy] of Object.entries(
      catalogueMigrationAliases,
    )) {
      const timestamps = await rows(
        h.db,
        "SELECT applied_at FROM schema_migrations WHERE version IN (?,?)",
        [canonical, legacy.version],
      );
      assert.equal(timestamps.length, 2);
      assert.equal(
        new Date(timestamps[0].applied_at).getTime(),
        new Date(timestamps[1].applied_at).getTime(),
      );
    }
    assert.deepEqual(
      await rows(
        h.db,
        "SELECT id,revision,price_cents FROM store_offers ORDER BY id LIMIT 5",
      ),
      before,
    );
  } finally {
    await migrate(h.db);
    for (const version of added)
      await execute(h.db, "DELETE FROM schema_migrations WHERE version=?", [
        version,
      ]);
    await h.close();
  }
});
