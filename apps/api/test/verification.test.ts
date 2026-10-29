import { test } from "node:test";
import assert from "node:assert/strict";
import { database, execute, first } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createApp } from "../src/app.js";
import type { Mail } from "../src/mail.js";
import { runJobs } from "../src/jobs.js";
import { smtpConfig } from "../src/mail.js";
import { otpHash } from "../src/verification.js";
const secret = "a".repeat(64);
const codeFrom = (mail: Mail) => mail.text.match(/\b(\d{6})\b/)![1];
async function setup() {
  assert.ok(process.env.TEST_DATABASE_URL?.endsWith("/poold_test"));
  const db = database(process.env.TEST_DATABASE_URL);
  await migrate(db);
  const mails: Mail[] = [];
  let failMail = false;
  const options = {
    otpSecret: secret,
    sendMail: async (mail: Mail) => {
      if (failMail) throw new Error("Test SMTP failure");
      mails.push(mail);
    },
  };
  let server = createApp(db, options).listen(0);
  let url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const users: string[] = [];
  const call = async (path: string, body?: unknown, token?: string) => {
    const response = await fetch(url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const register = async () => {
    const result = await call("/auth/register", {
      name: "OTP test",
      email: `otp-${crypto.randomUUID()}@example.invalid`,
      password: "testing-code-flow",
      native: true,
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    users.push(result.body.user.id);
    return result.body;
  };
  return {
    db,
    mails,
    call,
    register,
    setFailMail: (value: boolean) => {
      failMail = value;
    },
    async restart() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      server = createApp(db, options).listen(0);
      url = `http://127.0.0.1:${(server.address() as any).port}/api`;
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const uid of users)
        await execute(db, "DELETE FROM users WHERE id=?", [uid]);
      await db.end();
    },
  };
}
test("OTP: six-digit code, restart persistence, cooldown and authenticated single-use confirmation", async () => {
  const h = await setup();
  try {
    const account = await h.register(),
      raw = codeFrom(h.mails[0]);
    assert.match(raw, /^\d{6}$/);
    assert.equal(account.verification.delivery, "outbox");
    assert.equal(account.verification.remainingAttempts, 5);
    assert.equal(account.code, undefined);
    assert.equal(account.verification.code, undefined);
    assert.ok(!h.mails[0].text.includes("verify="));
    const persisted = await first(
      h.db,
      "SELECT * FROM email_verifications WHERE user_id=?",
      [account.user.id],
    );
    assert.equal(persisted.code_hash.length, 64);
    assert.notEqual(persisted.code_hash, raw);
    assert.ok(
      Date.parse(account.verification.expiresAt) - Date.now() > 9 * 60_000,
    );
    await h.restart();
    assert.equal(
      (await h.call("/auth/verification", undefined, account.token)).body
        .expiresAt,
      account.verification.expiresAt,
    );
    assert.equal(
      (await h.call("/auth/resend", {}, account.token)).body.error.code,
      "OTP_COOLDOWN",
    );
    assert.equal(h.mails.length, 1);
    assert.equal((await h.call("/auth/verify", { code: raw })).status, 401);
    const success = await h.call(
      "/auth/verify",
      { code: raw, native: true },
      account.token,
    );
    assert.equal(success.status, 200);
    assert.equal(success.body.user.verified, true);
    assert.equal(
      (await h.call("/session", undefined, account.token)).body.user,
      null,
    );
    assert.equal(
      (await h.call("/auth/verify", { code: raw }, success.body.token)).body
        .error.code,
      "ALREADY_VERIFIED",
    );
    assert.equal(
      await first(
        h.db,
        "SELECT user_id FROM email_verifications WHERE user_id=?",
        [account.user.id],
      ),
      undefined,
    );
  } finally {
    await h.close();
  }
});
test("OTP: wrong guesses commit, concurrent attempts lock at five, resend replaces the code", async () => {
  const h = await setup();
  try {
    const a = await h.register(),
      old = codeFrom(h.mails[0]),
      wrong = old === "000000" ? "000001" : "000000";
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        h.call("/auth/verify", { code: wrong }, a.token),
      ),
    );
    assert.equal(results.filter((r) => r.status === 400).length, 4);
    assert.equal(results.filter((r) => r.status === 429).length, 2);
    assert.equal(
      (
        await first(
          h.db,
          "SELECT attempts FROM email_verifications WHERE user_id=?",
          [a.user.id],
        )
      ).attempts,
      5,
    );
    assert.equal(
      (await h.call("/auth/verify", { code: old }, a.token)).body.error.code,
      "OTP_LOCKED",
    );
    await execute(
      h.db,
      "UPDATE email_verifications SET resend_at=? WHERE user_id=?",
      [new Date(Date.now() - 1000), a.user.id],
    );
    const sends = await Promise.all([
      h.call("/auth/resend", {}, a.token),
      h.call("/auth/resend", {}, a.token),
    ]);
    assert.deepEqual(sends.map((r) => r.status).sort(), [200, 429]);
    assert.equal(h.mails.length, 2);
    const next = codeFrom(h.mails[1]);
    assert.notEqual(next, old);
    assert.equal(
      (await h.call("/auth/verify", { code: old }, a.token)).body.error.code,
      "OTP_INVALID",
    );
    assert.equal(
      (await h.call("/auth/verify", { code: next }, a.token)).status,
      200,
    );
  } finally {
    await h.close();
  }
});
test("OTP: expiry, leading zeroes and user scoping", async () => {
  const h = await setup();
  try {
    const a = await h.register(),
      b = await h.register(),
      bCode = codeFrom(h.mails[1]);
    const other = await h.call(
      "/auth/verify",
      { code: bCode, userId: a.user.id },
      b.token,
    );
    assert.equal(other.status, 200);
    assert.equal(
      (await first(h.db, "SELECT verified FROM users WHERE id=?", [a.user.id]))
        .verified,
      0,
    );
    const row = await first(
      h.db,
      "SELECT nonce FROM email_verifications WHERE user_id=?",
      [a.user.id],
    );
    await execute(
      h.db,
      "UPDATE email_verifications SET code_hash=?,expires_at=? WHERE user_id=?",
      [
        otpHash(secret, a.user.id, row.nonce, "012345"),
        new Date(Date.now() - 1000),
        a.user.id,
      ],
    );
    assert.equal(
      (await h.call("/auth/verify", { code: "012345" }, a.token)).body.error
        .code,
      "OTP_EXPIRED",
    );
    await execute(
      h.db,
      "UPDATE email_verifications SET expires_at=? WHERE user_id=?",
      [new Date(Date.now() + 60_000), a.user.id],
    );
    assert.equal(
      (await h.call("/auth/verify", { code: "012345" }, a.token)).status,
      200,
    );
  } finally {
    await h.close();
  }
});
test("OTP: delivery failure preserves signup and allows retry without falsely claiming a sent email", async () => {
  const h = await setup();
  try {
    h.setFailMail(true);
    const a = await h.register();
    assert.equal(a.user.verified, false);
    assert.equal(a.verification.delivery, "failed");
    assert.equal(h.mails.length, 0);
    await runJobs(h.db);
    assert.equal(
      (await h.call("/auth/resend", {}, a.token)).body.error.code,
      "OTP_COOLDOWN",
    );
    assert.equal(
      (await h.call("/auth/verify", { code: "000000" }, a.token)).body.error
        .code,
      "OTP_REQUIRED",
    );
    await execute(
      h.db,
      "UPDATE email_verifications SET resend_at=? WHERE user_id=?",
      [new Date(Date.now() - 1000), a.user.id],
    );
    assert.equal((await h.call("/auth/resend", {}, a.token)).status, 502);
    h.setFailMail(false);
    await execute(
      h.db,
      "UPDATE email_verifications SET resend_at=? WHERE user_id=?",
      [new Date(Date.now() - 1000), a.user.id],
    );
    assert.equal(
      (await h.call("/auth/resend", {}, a.token)).body.delivery,
      "outbox",
    );
    assert.equal(
      (await h.call("/auth/verify", { code: codeFrom(h.mails[0]) }, a.token))
        .status,
      200,
    );
  } finally {
    await h.close();
  }
});
test("SMTP: Gmail STARTTLS/app-password settings and incomplete configuration", () => {
  assert.equal(smtpConfig({}), null);
  const config = smtpConfig({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "sender@gmail.com",
    SMTP_PASS: "abcd efgh ijkl mnop",
  });
  assert.ok(config);
  assert.equal(typeof config.options, "object");
  const options = config.options as any;
  assert.equal(options.host, "smtp.gmail.com");
  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.auth.pass, "abcdefghijklmnop");
  assert.equal(config.from, "POOLD <sender@gmail.com>");
  assert.throws(() => smtpConfig({ SMTP_HOST: "smtp.gmail.com" }), /together/);
  assert.throws(
    () => smtpConfig({ SMTP_URL: "smtps://example.invalid" }),
    /SMTP_FROM/,
  );
  assert.throws(
    () =>
      smtpConfig({
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "sender@gmail.com",
        SMTP_PASS: "fake",
        SMTP_PORT: "465",
        SMTP_SECURE: "false",
      }),
    /SMTP_SECURE/,
  );
});
