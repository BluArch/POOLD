import assert from "node:assert/strict";
import { database, execute } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { passwordHash, token } from "../src/security.js";
import { createApp } from "../src/app.js";
import type { OrderInput } from "@poold/contracts";
export async function setup() {
  assert.ok(process.env.TEST_DATABASE_URL?.endsWith("/poold_test"));
  const db = database(process.env.TEST_DATABASE_URL);
  await migrate(db);
  await seed(db);
  const server = createApp(db, { demo: true, sendMail: async () => {} }).listen(
    0,
  );
  const url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    auth = "",
  ) => {
    const r = await fetch(url + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: auth ? `Bearer ${auth}` : "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  // Multi-user scenarios use ordinary verified test fixtures, not extra demo logins.
  const fixturePassword = token();
  const encoded = await passwordHash(fixturePassword);
  for (const key of ["jordan", "alex", "priya"]) {
    await execute(
      db,
      "UPDATE users SET password_hash=?,verified=TRUE,demo=FALSE WHERE id=?",
      [encoded, `demo-${key}`],
    );
  }
  const login = async (key: string) => {
    const result =
      key === "maya"
        ? await call("/auth/demo", "POST", {
            userId: "demo-maya",
            native: true,
          })
        : await call("/auth/login", "POST", {
            email: `${key}@demo.poold.invalid`,
            password: fixturePassword,
            native: true,
          });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.token as string;
  };
  const tokens = {
    maya: await login("maya"),
    jordan: await login("jordan"),
    alex: await login("alex"),
    priya: await login("priya"),
  };
  const ids: string[] = [];
  const create = async (b = draft(), auth = tokens.maya) => {
    const r = await call("/orders", "POST", b, auth);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push(r.body.id);
    return r.body.id as string;
  };
  const publish = async (id: string, auth = tokens.maya) => {
    const r = await call(`/orders/${id}/publish`, "POST", {}, auth);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  };
  return {
    db,
    call,
    tokens,
    ids,
    create,
    publish,
    async close() {
      await new Promise<void>((r) => server.close(() => r()));
      for (const oid of ids) {
        await execute(
          db,
          "DELETE FROM share_claims WHERE item_id IN(SELECT id FROM order_items WHERE order_id=?)",
          [oid],
        );
        await execute(db, "DELETE FROM orders WHERE id=?", [oid]);
      }
      await db.end();
    },
  };
}
export function draft(overrides: Partial<OrderInput> = {}): OrderInput {
  const at = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  return {
    name: "Test pantry run",
    store: "Costco",
    kind: "community",
    visibility: "public",
    deadline: at(24),
    purchaseAt: at(26),
    pickupAt: at(28),
    pickupEnd: at(30),
    pickupLocation: "UVic SUB main lobby",
    pickupLat: 48.4649,
    pickupLng: -123.3089,
    publicPickup: true,
    maxMembers: 6,
    cadence: "once",
    items: [
      {
        name: "Eggs",
        category: "Chilled",
        packLabel: "30 eggs",
        shareLabel: "6 eggs",
        sharesPerPack: 5,
        packCount: 1,
        priceCents: 1001,
        referenceShareCents: null,
        storage: "Refrigerate",
        portioning: "Use a clean carton",
      },
    ],
    ...overrides,
  };
}
