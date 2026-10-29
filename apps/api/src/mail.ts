import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
export type Mail = { to: string; subject: string; text: string };
export type MailDelivery = "smtp" | "outbox";
export type MailSender = {
  (mail: Mail): Promise<void>;
  delivery?: MailDelivery;
};

export function smtpConfig(
  env: NodeJS.ProcessEnv = process.env,
): { options: string | SMTPTransport.Options; from: string } | null {
  if (env.SMTP_URL) {
    if (!env.SMTP_FROM?.trim())
      throw new Error("SMTP_FROM is required with SMTP_URL.");
    return { options: env.SMTP_URL, from: env.SMTP_FROM.trim() };
  }
  if (!env.SMTP_HOST && !env.SMTP_USER && !env.SMTP_PASS && !env.SMTP_FROM)
    return null;
  if (!env.SMTP_HOST?.trim() || !env.SMTP_USER?.trim() || !env.SMTP_PASS)
    throw new Error("Configure SMTP_HOST, SMTP_USER and SMTP_PASS together.");
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT must be a valid port.");
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    throw new Error("SMTP_SECURE must be true or false.");
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  if (port === 465 && !secure)
    throw new Error(
      "Use SMTP_SECURE=true for port 465, or port 587 with false.",
    );
  const host = env.SMTP_HOST.trim();
  const user = env.SMTP_USER.trim();
  const pass =
    host.toLowerCase() === "smtp.gmail.com"
      ? env.SMTP_PASS.replace(/\s/g, "")
      : env.SMTP_PASS;
  if (!pass) throw new Error("SMTP_PASS is required.");
  return {
    options: {
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    },
    from: env.SMTP_FROM?.trim() || `POOLD <${user}>`,
  };
}
export function mailTransport(production: boolean) {
  const config = smtpConfig();
  if (!config) {
    if (production)
      throw new Error(
        "Production requires SMTP settings for email verification.",
      );
    return null;
  }
  const transport =
    typeof config.options === "string"
      ? nodemailer.createTransport(config.options)
      : nodemailer.createTransport(config.options);
  return { transport, from: config.from };
}
export function mailer(production: boolean): MailSender {
  const configured = mailTransport(production);
  const delivery: MailDelivery = configured ? "smtp" : "outbox";
  const send: MailSender = async (mail) => {
    if (configured) {
      const info = await configured.transport.sendMail({
        ...mail,
        from: configured.from,
      });
      if (!info.accepted?.length || info.rejected?.length)
        throw Object.assign(new Error("SMTP did not accept the recipient."), {
          code: "RECIPIENT_REJECTED",
        });
    } else {
      const path = process.env.EMAIL_OUTBOX || "../../.local/mail-outbox.jsonl";
      await mkdir(dirname(path), { recursive: true });
      await appendFile(
        path,
        JSON.stringify({ ...mail, createdAt: new Date().toISOString() }) + "\n",
        { mode: 0o600 },
      );
    }
  };
  send.delivery = delivery;
  return send;
}
