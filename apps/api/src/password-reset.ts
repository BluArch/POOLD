import { randomInt, timingSafeEqual } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { MailSender } from "./mail.js";
import { execute, first, transaction } from "./db.js";
import { fail } from "./errors.js";
import { token, passwordHash } from "./security.js";
import {
  otpHash,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MS,
  OTP_TTL_MS,
} from "./verification.js";

/** The same answer whether or not the email has an account. */
export const RESET_SENT =
  "If that email has an account, we sent a six-digit code to it.";

/** Email a one-time reset code. Silently does nothing for unknown emails. */
export async function issueReset(
  db: Pool,
  email: string,
  secret: string,
  sendMail: MailSender,
) {
  const challenge = await transaction(db, async (c) => {
    const user = await first(
      c,
      "SELECT id,email FROM users WHERE email=? AND demo=FALSE FOR UPDATE",
      [email],
    );
    if (!user) return null;
    const previous = await first(
      c,
      "SELECT resend_at FROM password_resets WHERE user_id=? FOR UPDATE",
      [user.id],
    );
    const now = Date.now();
    if (previous && new Date(previous.resend_at).getTime() > now) return null;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0"),
      nonce = token(),
      digest = otpHash(secret, `reset:${user.id}`, nonce, code);
    await execute(
      c,
      `INSERT INTO password_resets(user_id,nonce,code_hash,attempts,expires_at,resend_at) VALUES(?,?,?,0,?,?) ON DUPLICATE KEY UPDATE nonce=VALUES(nonce),code_hash=VALUES(code_hash),attempts=0,expires_at=VALUES(expires_at),resend_at=VALUES(resend_at)`,
      [
        user.id,
        nonce,
        digest,
        new Date(now + OTP_TTL_MS),
        new Date(now + OTP_RESEND_MS),
      ],
    );
    return { email: user.email as string, code };
  });
  if (!challenge) return;
  try {
    await sendMail({
      to: challenge.email,
      subject: "Reset your POOLD password",
      text: `Your POOLD password reset code is ${challenge.code}.\n\nEnter it in the app within 10 minutes. If you didn’t ask to reset your password, you can ignore this email.`,
    });
  } catch {
    // Never reveal delivery problems here; the person can request again.
  }
}

/** Check the code, set the new password and sign out every other device. */
export async function confirmReset(
  db: Pool,
  email: string,
  code: string,
  password: string,
  secret: string,
): Promise<string> {
  const encoded = await passwordHash(password);
  const result = await transaction(db, async (c) => {
    const user = await first(
      c,
      "SELECT id FROM users WHERE email=? AND demo=FALSE",
      [email],
    );
    const row = user
      ? await first(
          c,
          "SELECT * FROM password_resets WHERE user_id=? FOR UPDATE",
          [user.id],
        )
      : null;
    const invalid = {
      status: 400,
      code: "RESET_INVALID",
      message: "That code is wrong or has expired. Request a new one.",
    };
    if (!user || !row) return invalid;
    if (
      row.attempts >= OTP_MAX_ATTEMPTS ||
      new Date(row.expires_at).getTime() <= Date.now()
    )
      return invalid;
    const expected = otpHash(secret, `reset:${user.id}`, row.nonce, code);
    if (
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(row.code_hash, "hex"),
      )
    ) {
      await execute(
        c,
        "UPDATE password_resets SET attempts=attempts+1 WHERE user_id=?",
        [user.id],
      );
      return invalid;
    }
    await execute(c, "UPDATE users SET password_hash=? WHERE id=?", [
      encoded,
      user.id,
    ]);
    await execute(c, "DELETE FROM password_resets WHERE user_id=?", [user.id]);
    await execute(c, "DELETE FROM sessions WHERE user_id=?", [user.id]);
    return { uid: user.id as string };
  });
  if ("status" in result) fail(result.status, result.code, result.message);
  return (result as { uid: string }).uid;
}
