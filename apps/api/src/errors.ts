import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new AppError(status, code, message);
}
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION",
        message: err.issues.map((i) => i.message).join(" "),
        details: err.issues,
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err.code === "ER_DUP_ENTRY") {
    res.status(409).json({
      error: { code: "DUPLICATE", message: "This record already exists." },
    });
    return;
  }
  if (err.type === "entity.too.large") {
    res.status(413).json({
      error: {
        code: "TOO_LARGE",
        message: "The image or request is too large.",
      },
    });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Send a valid JSON request." },
    });
    return;
  }
  console.error(err);
  res.status(500).json({
    error: {
      code: "INTERNAL",
      message: "Something went wrong. Please retry.",
    },
  });
};

export const RATE_LIMIT_ERROR = {
  error: {
    code: "RATE_LIMIT",
    message: "Too many requests. Please wait and retry.",
  },
};
