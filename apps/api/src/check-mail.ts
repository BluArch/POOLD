import { mailTransport } from "./mail.js";
try {
  const configured = mailTransport(false);
  if (!configured)
    throw new Error(
      "Configure SMTP_HOST, SMTP_USER and SMTP_PASS (or SMTP_URL) in the root .env first.",
    );
  await configured.transport.verify();
  console.log(
    "SMTP connection and authentication verified. No email was sent.",
  );
  configured.transport.close();
} catch (error) {
  const details = error as Error & { code?: string; responseCode?: number };
  const code =
    typeof details.code === "string" && /^[A-Z0-9_]+$/.test(details.code)
      ? details.code
      : undefined;
  const response =
    typeof details.responseCode === "number" ? details.responseCode : undefined;
  const diagnostic = [code, response ? `SMTP ${response}` : undefined]
    .filter(Boolean)
    .join(", ");
  const configurationError =
    error instanceof Error && /^(Configure|SMTP_)/.test(error.message);
  console.error(
    configurationError
      ? error.message
      : `SMTP verification failed${diagnostic ? ` (${diagnostic})` : ""}. ${code === "EAUTH" ? "Check SMTP_USER and the Gmail App Password for that same account." : "Check the sender settings and network connection."}`,
  );
  process.exitCode = 1;
}
