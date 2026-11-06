import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { database, execute, first, rows } from "./db.js";
import type { Pool } from "mysql2/promise";
/** Identical local catalogue migrations were published on main under canonical names.
 * Keep the original history and adopt the canonical marker without repeating their DDL.
 * A checksum mismatch requires manual reconciliation instead of assuming equivalence.
 */
export const catalogueMigrationAliases: Record<
  string,
  { version: string; checksum: string }
> = {
  "013_catalogue_foundation.sql": {
    version: "005_catalogue_foundation.sql",
    checksum:
      "4ee00d1a7ce811a50a5dc33f1213f144a701f204172015e0a5eab8b66565a09d",
  },
  "014_catalogue_locations.sql": {
    version: "009_catalogue_locations.sql",
    checksum:
      "15c062da37efbaa5b9793917391a7dc63fbbff35804fc902d6536918d8c4b6f1",
  },
  "015_catalogue_offer_source.sql": {
    version: "010_catalogue_offer_source.sql",
    checksum:
      "4131dddb6fcb616795f3e636a7c22a72de7c551a28ad5d697edfed566636accb",
  },
  "016_catalogue_price_origin.sql": {
    version: "011_catalogue_price_origin.sql",
    checksum:
      "2be014bc2d0c5b708d6b10c7804004d71b678af66807e9b9ba8406ef3b4db3a1",
  },
};
export async function migrate(db: Pool) {
  const c = await db.getConnection();
  try {
    const lock = await first(
      c,
      "SELECT GET_LOCK('poold_migrations',30) AS acquired",
    );
    if (!lock.acquired) throw new Error("Another migration is still running.");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3))",
    );
    const dir = fileURLToPath(
      new URL("../../../db/migrations/", import.meta.url),
    );
    for (const f of (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        await first(
          c,
          "SELECT version FROM schema_migrations WHERE version=?",
          [f],
        )
      )
        continue;
      const sql = await readFile(`${dir}/${f}`, "utf8");
      const alias = catalogueMigrationAliases[f];
      if (
        alias &&
        (await first(
          c,
          "SELECT version FROM schema_migrations WHERE version=?",
          [alias.version],
        ))
      ) {
        if (createHash("sha256").update(sql).digest("hex") !== alias.checksum)
          throw new Error(
            `Catalogue migration ${f} differs from the applied local migration ${alias.version}. Reconcile it before continuing.`,
          );
        await execute(
          c,
          "INSERT INTO schema_migrations(version,applied_at) SELECT ?,applied_at FROM schema_migrations WHERE version=?",
          [f, alias.version],
        );
        console.log(
          `Adopted ${f} from ${alias.version}; existing schema and history preserved.`,
        );
        continue;
      }
      // MySQL DDL auto-commits: apply each version once, and fail visibly on partial DDL.
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await c.query(statement);
      await execute(c, "INSERT INTO schema_migrations(version) VALUES(?)", [f]);
      console.log(`Applied ${f}`);
    }
    console.log(
      `Schema ready (${(await rows(c, "SELECT version FROM schema_migrations")).length} migration).`,
    );
  } finally {
    await c.query("SELECT RELEASE_LOCK('poold_migrations')");
    c.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = database();
  try {
    await migrate(db);
  } finally {
    await db.end();
  }
}
