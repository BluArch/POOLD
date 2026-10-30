import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type PoolOptions,
} from "mysql2/promise";
export type DB = Pool | PoolConnection;
export function databaseOptions(
  url = process.env.DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env,
): PoolOptions {
  if (!url) throw new Error("DATABASE_URL is required.");
  const u = new URL(url);
  if (u.protocol !== "mysql:")
    throw new Error("DATABASE_URL must use mysql://.");
  const ssl =
    env.DATABASE_SSL ?? (env.NODE_ENV === "production" ? "true" : "false");
  if (!["true", "false"].includes(ssl))
    throw new Error("DATABASE_SSL must be true or false.");
  if (env.NODE_ENV === "production" && ssl !== "true")
    throw new Error("Production database connections require TLS.");
  const connectionLimit = Number(
    env.DATABASE_POOL_SIZE ?? (env.NODE_ENV === "production" ? 5 : 12),
  );
  if (
    !Number.isInteger(connectionLimit) ||
    connectionLimit < 1 ||
    connectionLimit > 50
  )
    throw new Error("DATABASE_POOL_SIZE must be an integer from 1 to 50.");
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    connectionLimit,
    ...(ssl === "true"
      ? {
          ssl: {
            rejectUnauthorized: true,
            verifyIdentity: true,
            ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {}),
          },
        }
      : {}),
    timezone: "Z",
    decimalNumbers: true,
    charset: "utf8mb4",
    multipleStatements: false,
  };
}
export function database(url = process.env.DATABASE_URL) {
  const pool = mysql.createPool(databaseOptions(url));
  // Driver parsing timezone does not change MySQL CURRENT_TIMESTAMP defaults.
  // Queue this before the first statement on every new pooled connection.
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
}
export async function rows(
  db: DB,
  sql: string,
  args: any[] = [],
): Promise<any[]> {
  const [r] = await db.query(sql, args);
  return r as any[];
}
export async function first(
  db: DB,
  sql: string,
  args: any[] = [],
): Promise<any | undefined> {
  return (await rows(db, sql, args))[0];
}
export async function execute(db: DB, sql: string, args: any[] = []) {
  const [r] = await db.execute(sql, args);
  return r as ResultSetHeader;
}
export async function transaction<T>(
  pool: Pool,
  work: (c: PoolConnection) => Promise<T>,
): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    const result = await work(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export const iso = (d: Date | string) => new Date(d).toISOString();
