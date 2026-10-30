import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "mysql2/promise";
import { databaseOptions } from "../src/db.js";
import { createApp } from "../src/app.js";

test("hosting: production MySQL verifies certificates and refuses plaintext", () => {
  const url = "mysql://poold:fake-password@db.example:1234/defaultdb";
  const options = databaseOptions(url, {
    NODE_ENV: "production",
    DATABASE_CA_CERT: "provider-ca",
  });
  assert.deepEqual(options.ssl, {
    rejectUnauthorized: true,
    verifyIdentity: true,
    ca: "provider-ca",
  });
  assert.equal(options.connectionLimit, 5);
  assert.equal(options.port, 1234);
  assert.equal(options.database, "defaultdb");
  assert.throws(
    () =>
      databaseOptions(url, { NODE_ENV: "production", DATABASE_SSL: "false" }),
    /require TLS/,
  );
  assert.throws(
    () => databaseOptions(url, { DATABASE_SSL: "invalid" }),
    /true or false/,
  );
  assert.throws(
    () => databaseOptions(url, { DATABASE_POOL_SIZE: "0" }),
    /1 to 50/,
  );
  assert.equal(databaseOptions(url, {}).ssl, undefined);
});

test("hosting: same-origin web routes preserve API responses and client IPs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "poold-hosting-"));
  const keys = [
    "STATIC_WEB_DIR",
    "TRUST_PROXY_HOPS",
    "APP_ORIGIN",
    "RENDER_EXTERNAL_URL",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
  try {
    await writeFile(
      join(dir, "index.html"),
      "<!doctype html><title>POOLD hosting test</title>",
    );
    process.env.STATIC_WEB_DIR = dir;
    process.env.TRUST_PROXY_HOPS = "1";
    delete process.env.APP_ORIGIN;
    process.env.RENDER_EXTERNAL_URL = "https://poold.example";
    const db = { query: async () => [[], []] } as unknown as Pool;
    const app = createApp(db, {
      production: true,
      otpSecret: "f".repeat(64),
      sendMail: async () => {},
    });
    assert.equal(app.get("trust proxy"), 1);
    assert.equal(app.get("trust proxy fn")("127.0.0.1", 0), true);
    assert.equal(app.get("trust proxy fn")("203.0.113.1", 1), false);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const home = await fetch(base + "/");
    assert.match(await home.text(), /POOLD hosting test/);
    assert.match(
      await (await fetch(base + "/order/some-order")).text(),
      /POOLD hosting test/,
    );
    assert.equal((await fetch(base + "/_expo/missing.js")).status, 404);
    assert.deepEqual(await (await fetch(base + "/api/health")).json(), {
      ok: true,
      database: "mysql",
    });
    const unknown = await fetch(base + "/api/missing");
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error.code, "NOT_FOUND");
    const cors = await fetch(base + "/api/health", {
      headers: { Origin: "https://poold.example" },
    });
    assert.equal(
      cors.headers.get("access-control-allow-origin"),
      "https://poold.example",
    );
    const demo = await fetch(base + "/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(demo.status, 404);
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server!.close((err) => (err ? reject(err) : resolve())),
      );
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
});
