import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "mysql2/promise";
import type { EmailVerification } from "@poold/contracts";
import type { MailSender } from "./mail.js";
import { execute, first, iso, transaction, type DB } from "./db.js";
import { fail } from "./errors.js";
import { token } from "./security.js";
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_RESEND_MS = 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export function verificationSecret(production: boolean): string {
  if (process.env.OTP_SECRET) {
    if (!/^[a-f0-9]{64}$/i.test(process.env.OTP_SECRET))
      throw new Error(
        "OTP_SECRET must contain 64 random hexadecimal characters.",
      );
    return process.env.OTP_SECRET;
  }
  if (production)
    throw new Error(
      "Production requires OTP_SECRET. Generate it with node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\".",
    );
  const path = fileURLToPath(
    new URL("../../../.local/otp-secret", import.meta.url),
  );
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, token(), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const secret = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new Error("The local OTP secret is invalid.");
  return secret;
}
export const otpHash = (
  secret: string,
  uid: string,
  nonce: string,
  code: string,
) =>
  createHmac("sha256", secret).update(`${uid}:${nonce}:${code}`).digest("hex");
function matches(secret: string, uid: string, row: any, code: string) {
  return timingSafeEqual(
    Buffer.from(row.code_hash, "hex"),
    Buffer.from(otpHash(secret, uid, row.nonce, code), "hex"),
  );
}
export async function verificationStatus(
  db: DB,
  uid: string,
): Promise<EmailVerification> {
  const row = await first(
    db,
    "SELECT * FROM email_verifications WHERE user_id=?",
    [uid],
  );
  if (!row)
    return {
      delivery: "none",
      expiresAt: null,
      resendAt: null,
      remainingAttempts: OTP_MAX_ATTEMPTS,
      message: "Request a six-digit code to verify your email.",
    };
  const messages = {
    pending: "Your verification code is being sent.",
    smtp: "A six-digit verification code was sent to your email.",
    outbox:
      "Your last code was saved to the local development email outbox. No email was sent.",
    failed:
      "We couldn’t send your code. Check the email sender settings, then try resending.",
  };
  return {
    delivery: row.delivery,
    expiresAt: iso(row.expires_at),
    resendAt: iso(row.resend_at),
    remainingAttempts: Math.max(0, OTP_MAX_ATTEMPTS - row.attempts),
    message: messages[row.delivery as keyof typeof messages],
  };
}
export async function issueVerification(
  db: Pool,
  uid: string,
  secret: string,
  sendMail: MailSender,
): Promise<EmailVerification> {
  const challenge = await transaction(db, async (c) => {
    const user = await first(
      c,
      "SELECT id,email,verified FROM users WHERE id=? FOR UPDATE",
      [uid],
    );
    if (!user) fail(401, "SIGN_IN", "Please sign in again.");
    if (user.verified)
      fail(409, "ALREADY_VERIFIED", "Your email is already verified.");
    const previous = await first(
      c,
      "SELECT * FROM email_verifications WHERE user_id=? FOR UPDATE",
      [uid],
    );
    const now = Date.now();
    if (previous && new Date(previous.resend_at).getTime() > now)
      fail(429, "OTP_COOLDOWN", "Please wait before requesting another code.");
    // Avoid reissuing the preceding code, including after its attempt limit.
    let code: string;
    do {
      code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    } while (previous && matches(secret, uid, previous, code));
    const nonce = token(),
      digest = otpHash(secret, uid, nonce, code);
    await execute(
      c,
      `INSERT INTO email_verifications(user_id,nonce,code_hash,attempts,expires_at,resend_at,delivery) VALUES(?,?,?,0,?,?,'pending') ON DUPLICATE KEY UPDATE nonce=?,code_hash=?,attempts=0,expires_at=?,resend_at=?,delivery='pending'`,
      [
        uid,
        nonce,
        digest,
        new Date(now + OTP_TTL_MS),
        new Date(now + OTP_RESEND_MS),
        nonce,
        digest,
        new Date(now + OTP_TTL_MS),
        new Date(now + OTP_RESEND_MS),
      ],
    );
    return { email: user.email, code, nonce };
  });
  try {
    await sendMail({
      to: challenge.email,
      subject: "Your POOLD verification code",
      text: `Your POOLD verification code is ${challenge.code}.\n\nEnter it in the app within 10 minutes. It can be used only once. If you didn’t request this code, you can ignore this email.`,
    });
    await execute(
      db,
      "UPDATE email_verifications SET delivery=? WHERE user_id=? AND nonce=?",
      [sendMail.delivery ?? "outbox", uid, challenge.nonce],
    );
  } catch {
    // Never claim that SMTP delivery succeeded or expose transport credentials in errors.
    await execute(
      db,
      "UPDATE email_verifications SET delivery='failed',expires_at=UTC_TIMESTAMP(3),resend_at=? WHERE user_id=? AND nonce=?",
      [new Date(Date.now() + 10_000), uid, challenge.nonce],
    );
  }
  return verificationStatus(db, uid);
}
export async function confirmVerification(
  db: Pool,
  uid: string,
  code: string,
  secret: string,
  sessionHash?: string,
) {
  const result = await transaction(db, async (c) => {
    const user = await first(
      c,
      "SELECT verified FROM users WHERE id=? FOR UPDATE",
      [uid],
    );
    if (!user)
      return { status: 401, code: "SIGN_IN", message: "Please sign in again." };
    if (user.verified)
      return {
        status: 409,
        code: "ALREADY_VERIFIED",
        message: "Your email is already verified.",
      };
    const v = await first(
      c,
      "SELECT * FROM email_verifications WHERE user_id=? FOR UPDATE",
      [uid],
    );
    if (!v || v.delivery === "failed")
      return {
        status: 400,
        code: "OTP_REQUIRED",
        message: "Request a new verification code first.",
      };
    if (v.attempts >= OTP_MAX_ATTEMPTS)
      return {
        status: 429,
        code: "OTP_LOCKED",
        message: "Too many incorrect codes. Request a new code to try again.",
      };
    if (new Date(v.expires_at).getTime() <= Date.now())
      return {
        status: 400,
        code: "OTP_EXPIRED",
        message: "This code has expired. Request a new code.",
      };
    if (!matches(secret, uid, v, code)) {
      const attempts = v.attempts + 1;
      await execute(
        c,
        "UPDATE email_verifications SET attempts=? WHERE user_id=?",
        [attempts, uid],
      );
      return {
        status: attempts >= OTP_MAX_ATTEMPTS ? 429 : 400,
        code: attempts >= OTP_MAX_ATTEMPTS ? "OTP_LOCKED" : "OTP_INVALID",
        message:
          attempts >= OTP_MAX_ATTEMPTS
            ? "Too many incorrect codes. Request a new code to try again."
            : "That code doesn’t match. Check your email and try again.",
      };
    }
    await execute(c, "UPDATE users SET verified=TRUE WHERE id=?", [uid]);
    await execute(c, "DELETE FROM email_verifications WHERE user_id=?", [uid]);
    if (sessionHash)
      await execute(c, "DELETE FROM sessions WHERE token_hash=?", [
        sessionHash,
      ]);
    return null;
  });
  // Failed guesses must commit their counter before returning an HTTP error.
  if (result) fail(result.status, result.code, result.message);
}
