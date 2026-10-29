import { test } from "node:test";
import assert from "node:assert/strict";
import { database, execute } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createApp } from "../src/app.js";
import type { Mail } from "../src/mail.js";
test("foundation: registration, verification, persistence, sessions, production demo guard", async () => {
  assert.ok(
    process.env.TEST_DATABASE_URL?.endsWith("/poold_test"),
    "Tests require the dedicated poold_test database.",
  );
  const db = database(process.env.TEST_DATABASE_URL);
  await migrate(db);
  const mails: Mail[] = [];
  let app = createApp(db, {
    demo: true,
    sendMail: async (m) => {
      mails.push(m);
    },
  });
  let server = app.listen(0);
  let url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (path: string, body?: unknown, cookie = "") => {
    const r = await fetch(url + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { r, b: await r.json() };
  };
  const email = `test-${Date.now()}@uvic.ca`;
  let cookie = "";
  try {
    const reg = await call("/auth/register", {
      name: "Persistence test",
      email,
      password: "correct horse battery",
    });
    assert.equal(reg.r.status, 201);
    assert.equal(mails.length, 1);
    assert.equal(reg.b.user.email, email);
    assert.equal(reg.b.user.verified, false);
    assert.equal(reg.b.token, undefined);
    cookie = reg.r.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await call("/session", undefined, cookie)).b.user.email,
      email,
    );
    assert.equal((await call("/orders", undefined, cookie)).r.status, 403);
    assert.equal((await call("/auth/resend", {}, cookie)).r.status, 429);
    assert.equal(mails.length, 1);
    await call("/auth/logout", {}, cookie);
    const logged = await call("/auth/login", {
      email,
      password: "correct horse battery",
    });
    assert.equal(logged.b.user.verified, false);
    cookie = logged.r.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await call("/profile", undefined, cookie)).b.email, email);
    const raw = mails[0].text.match(/\b(\d{6})\b/)![1];
    const v = await call("/auth/verify", { code: raw }, cookie);
    assert.equal(v.b.user.verified, true);
    assert.equal(v.b.user.university, true);
    cookie = v.r.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await call("/auth/verify", { code: raw }, cookie)).r.status,
      409,
    );
    await new Promise<void>((r) => server.close(() => r()));
    app = createApp(db, { sendMail: async () => {} });
    server = app.listen(0);
    url = `http://127.0.0.1:${(server.address() as any).port}/api`;
    assert.equal(
      (await call("/session", undefined, cookie)).b.user.email,
      email,
    );
    await call("/auth/logout", {}, cookie);
    assert.equal((await call("/session", undefined, cookie)).b.user, null);
    const prod = createApp(db, {
      production: true,
      otpSecret: "f".repeat(64),
      demo: true,
      sendMail: async () => {},
    });
    const p = prod.listen(0);
    const result = await fetch(
      `http://127.0.0.1:${(p.address() as any).port}/api/auth/demo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(result.status, 404);
    await new Promise<void>((r) => p.close(() => r()));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await execute(db, "DELETE FROM users WHERE email=?", [email]);
    await db.end();
  }
});

test("foundation: native registration starts an unverified session in development and production", async () => {
  assert.ok(process.env.TEST_DATABASE_URL?.endsWith("/poold_test"));
  const db = database(process.env.TEST_DATABASE_URL);
  try {
    for (const production of [false, true]) {
      const email = `native-register-${production}-${Date.now()}@example.com`;
      const server = createApp(db, {
        production,
        otpSecret: "f".repeat(64),
        sendMail: async () => {},
      }).listen(0);
      const url = `http://127.0.0.1:${(server.address() as any).port}/api`;
      try {
        const response = await fetch(url + "/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Native signup",
            email,
            password: "12345678",
            native: true,
          }),
        });
        const body = await response.json();
        assert.equal(response.status, 201);
        assert.equal(body.user.email, email);
        assert.equal(body.user.verified, false);
        assert.match(body.token, /^[a-f0-9]{64}$/);
        const headers = { Authorization: `Bearer ${body.token}` };
        const session = await fetch(url + "/session", { headers });
        assert.equal((await session.json()).user.email, email);
        assert.equal((await fetch(url + "/orders", { headers })).status, 403);
        if (production)
          assert.match(response.headers.get("set-cookie")!, /; Secure/);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
        await execute(db, "DELETE FROM users WHERE email=?", [email]);
      }
    }
  } finally {
    await db.end();
  }
});

test("foundation: JSON errors for invalid bodies, cross-origin writes and rate limits", async () => {
  assert.ok(process.env.TEST_DATABASE_URL?.endsWith("/poold_test"));
  const db = database(process.env.TEST_DATABASE_URL);
  const server = createApp(db, {
    demo: false,
    sendMail: async () => {},
  }).listen(0);
  const url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  try {
    const unsupported = await fetch(url + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    assert.equal(unsupported.status, 415);
    assert.equal((await unsupported.json()).error.code, "CONTENT_TYPE");
    const badOrigin = await fetch(url + "/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: "{}",
    });
    assert.equal(badOrigin.status, 403);
    assert.equal((await badOrigin.json()).error.code, "ORIGIN");
    const empty = await fetch(url + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error.code, "VALIDATION");
    let limited: Response | undefined;
    for (let n = 0; n < 31; n++)
      limited = await fetch(url + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    assert.equal(limited!.status, 429);
    const body = await limited!.json();
    assert.equal(body.error.code, "RATE_LIMIT");
    assert.equal(typeof body.error.message, "string");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await db.end();
  }
});
