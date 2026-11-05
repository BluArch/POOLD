import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createApp } from "../src/app.js";
import type { Mail } from "../src/mail.js";

async function start() {
  const db = database(process.env.TEST_DATABASE_URL);
  await migrate(db);
  const mails: Mail[] = [];
  const server = createApp(db, {
    demo: false,
    sendMail: async (m) => {
      mails.push(m);
    },
  }).listen(0);
  const url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (path: string, body: unknown, headers = {}) => {
    const r = await fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const close = async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.end();
  };
  return { call, mails, close };
}

test("forgot password: code by email, new password works, old one doesn't", async () => {
  const h = await start();
  const email = `reset-${Date.now()}@uvic.ca`;
  try {
    assert.equal(
      (
        await h.call("/auth/register", {
          name: "Reset",
          email,
          password: "old password 1",
        })
      ).status,
      201,
    );
    // Unknown and known emails get the same answer.
    const unknown = await h.call("/auth/forgot", {
      email: `nobody-${Date.now()}@uvic.ca`,
    });
    const known = await h.call("/auth/forgot", { email });
    assert.equal(unknown.status, 200);
    assert.equal(known.body.message, unknown.body.message);
    const mail = h.mails.find((m) => m.subject.includes("Reset"))!;
    assert.equal(mail.to, email);
    const code = mail.text.match(/\b(\d{6})\b/)![1];
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await h.call("/auth/reset", {
      email,
      code: wrong,
      password: "new password 2",
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "RESET_INVALID");
    const ok = await h.call("/auth/reset", {
      email,
      code,
      password: "new password 2",
      native: true,
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.email, email);
    // A code works only once.
    assert.equal(
      (await h.call("/auth/reset", { email, code, password: "another one 3" }))
        .status,
      400,
    );
    assert.equal(
      (await h.call("/auth/login", { email, password: "old password 1" }))
        .status,
      401,
    );
    assert.equal(
      (await h.call("/auth/login", { email, password: "new password 2" }))
        .status,
      200,
    );
  } finally {
    await h.close();
  }
});

test("shared Wi-Fi: one person's failed logins don't lock out classmates", async () => {
  const h = await start();
  const stamp = Date.now();
  try {
    let limited = 0;
    for (let n = 0; n < 12; n++) {
      const r = await h.call("/auth/login", {
        email: `typo-${stamp}@uvic.ca`,
        password: "wrong",
      });
      if (r.status === 429) limited++;
    }
    assert.ok(limited > 0, "repeated attempts on one email are limited");
    // 25 different classmates on the same network can still sign in.
    for (let n = 0; n < 25; n++) {
      const r = await h.call("/auth/login", {
        email: `class-${stamp}-${n}@uvic.ca`,
        password: "whatever",
      });
      assert.equal(r.status, 401, `classmate ${n} got ${r.status}`);
    }
  } finally {
    await h.close();
  }
});
