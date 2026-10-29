import {
  createHash,
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
export const id = randomUUID;
export const token = () => randomBytes(32).toString("hex");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const scrypt = promisify(rawScrypt);
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [salt, expected] = encoded.split(":");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const bytes = Buffer.from(expected, "hex");
  return bytes.length === key.length && timingSafeEqual(bytes, key);
}
