import { mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { paths } from "./paths.ts";
import { logger } from "./log.ts";

export const AuthSchema = z.object({
  apiKey: z.string(),
  accountId: z.string(),
  email: z.string(),
  phoneNumber: z.string().nullable(),
  phoneNumberId: z.string().nullable(),
});
export type Auth = z.infer<typeof AuthSchema>;

export const PendingSignupSchema = z.object({
  verificationId: z.string(),
  email: z.string(),
  createdAt: z.string(),
});
export type PendingSignup = z.infer<typeof PendingSignupSchema>;

const CHMOD_UNSUPPORTED_CODES = new Set(["ENOTSUP", "EOPNOTSUPP", "EPERM"]);

function ensureDir(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    chmodSync(dirname(path), 0o700);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && CHMOD_UNSUPPORTED_CODES.has(code)) {
      logger.warn({ err, code, path: dirname(path) }, "chmod 0700 unsupported, continuing");
      return;
    }
    throw err;
  }
}

function readSecure<T>(path: string, schema: z.ZodSchema<T>): T | null {
  let stat;
  try {
    stat = statSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const mode = stat.mode & 0o777;
  if (mode & 0o077) {
    throw new Error(`${path} has insecure permissions (mode ${mode.toString(8)})`);
  }
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn({ err, path }, "failed to parse state file");
    return null;
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    logger.warn({ path, issues: result.error.issues }, "state file did not match expected schema");
    return null;
  }
  return result.data;
}

function writeSecure(path: string, data: unknown) {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readAuth(): Auth | null {
  return readSecure(paths().authFile, AuthSchema);
}

export function writeAuth(auth: Auth): void {
  writeSecure(paths().authFile, auth);
}

function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

export function clearAuth(): void {
  unlinkIfExists(paths().authFile);
}

export function readPendingSignup(): PendingSignup | null {
  return readSecure(paths().pendingSignupFile, PendingSignupSchema);
}

export function writePendingSignup(p: PendingSignup): void {
  writeSecure(paths().pendingSignupFile, p);
}

export function clearPendingSignup(): void {
  unlinkIfExists(paths().pendingSignupFile);
}
