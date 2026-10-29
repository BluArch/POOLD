import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { database, execute, first, rows } from "./db.js";
import type { Pool } from "mysql2/promise";
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
