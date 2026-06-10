import { z } from "zod";
import { paths } from "./paths.ts";
import { defineVersionedFile } from "./versioned-file.ts";

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

const authFile = defineVersionedFile<Auth>({
  dir: () => paths().dataDir,
  base: "auth",
  version: 1,
  schema: AuthSchema,
  migrations: { 0: (legacy) => legacy },
  secure: true,
});

const pendingSignupFile = defineVersionedFile<PendingSignup>({
  dir: () => paths().dataDir,
  base: "pending-signup",
  version: 1,
  schema: PendingSignupSchema,
  migrations: { 0: (legacy) => legacy },
  secure: true,
});

export function readAuth(): Auth | null {
  return authFile.read();
}

export function writeAuth(auth: Auth): void {
  authFile.write(auth);
}

export function clearAuth(): void {
  authFile.clear();
}

/** Where the API key lives, for display (doctor). */
export function authFilePath(): string {
  return authFile.path;
}

export function readPendingSignup(): PendingSignup | null {
  return pendingSignupFile.read();
}

export function writePendingSignup(p: PendingSignup): void {
  pendingSignupFile.write(p);
}

export function clearPendingSignup(): void {
  pendingSignupFile.clear();
}
