import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { createApp } from "../src/app.js";

test("hosted demo: explicit opt-in seeds Maya and groups, keeps secure cookies and hides outbox", async () => {
  assert.ok(process.env.TEST_DATABASE_URL?.endsWith("/poold_test"));
  const db = database(process.env.TEST_DATABASE_URL);
  const keys = ["NODE_ENV", "HOSTED_DEMO_ENABLED", "DEMO_ENABLED"] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const servers: ReturnType<ReturnType<typeof createApp>["listen"]>[] = [];
  try {
    await migrate(db);
    process.env.NODE_ENV = "production";
    process.env.DEMO_ENABLED = "true";
    delete process.env.HOSTED_DEMO_ENABLED;
    await assert.rejects(seed(db), /Hosted seeding requires/);
    process.env.HOSTED_DEMO_ENABLED = "true";
    await seed(db);
    const options = {
      production: true,
      otpSecret: "f".repeat(64),
      sendMail: async () => {},
    };
    const server = createApp(db, options).listen(0);
    servers.push(server);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    assert.equal(
      (await (await fetch(base + "/session")).json()).demoEnabled,
      true,
    );
    const login = await fetch(base + "/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "demo-maya", native: true }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie")!, /; Secure/);
    assert.match(login.headers.get("set-cookie")!, /; HttpOnly/);
    const body = await login.json();
    assert.equal(body.user.name, "Maya R.");
    const headers = { Authorization: `Bearer ${body.token}` };
    assert.equal(
      (await (await fetch(base + "/session", { headers })).json()).user.id,
      "demo-maya",
    );
    assert.equal((await fetch(base + "/orders", { headers })).status, 200);
    const [groups] = await db.query(
      "SELECT name FROM orders WHERE organizer_id LIKE 'demo-%' AND status='open'",
    );
    const names = (groups as { name: string }[]).map((group) => group.name);
    for (const name of [
      "Campus pantry run",
      "Roommate restock",
      "Saturday essentials",
      "Split a box of Clif bars",
    ])
      assert.ok(names.includes(name), name);
    assert.equal((await fetch(base + "/dev/outbox")).status, 404);
    const other = await fetch(base + "/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "demo-jordan" }),
    });
    assert.equal(other.status, 400);
    delete process.env.HOSTED_DEMO_ENABLED;
    const disabled = createApp(db, { ...options, demo: true }).listen(0);
    servers.push(disabled);
    const disabledAddress = disabled.address();
    assert.ok(disabledAddress && typeof disabledAddress !== "string");
    const state = await (
      await fetch(`http://127.0.0.1:${disabledAddress.port}/api/session`, {
        headers,
      })
    ).json();
    assert.equal(state.demoEnabled, false);
    assert.equal(state.user, null);
  } finally {
    for (const server of servers)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await db.end();
  }
});
