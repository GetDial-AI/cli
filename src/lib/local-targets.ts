import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { z } from "zod";
import { paths } from "./paths.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "0.0.0.0", "localhost", "::1", "[::1]"]);

export const DEFAULT_TIMEOUT_SECONDS = 5;
export const DEFAULT_SIGNATURE_HEADER = "X-Dial-Signature";

export const UrlTargetSchema = z.object({
  kind: z.literal("url"),
  url: z.string(),
  secret: z.string().optional(),
  signatureHeader: z.string().optional(),
  bearer: z.string().optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});
export type UrlTarget = z.infer<typeof UrlTargetSchema>;

export const CmdTargetSchema = z.object({
  kind: z.literal("cmd"),
  path: z.string(),
  args: z.array(z.string()).default([]),
  timeoutSeconds: z.number().int().positive().optional(),
});
export type CmdTarget = z.infer<typeof CmdTargetSchema>;

export const LocalTargetSchema = z.discriminatedUnion("kind", [UrlTargetSchema, CmdTargetSchema]);
export type LocalTarget = z.infer<typeof LocalTargetSchema>;

const RegistrySchema = z.object({
  targets: z.array(LocalTargetSchema).default([]),
});
type Registry = z.infer<typeof RegistrySchema>;

export class LocalTargetError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function assertLoopbackUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new LocalTargetError("invalid_url", `not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LocalTargetError("invalid_scheme", `URL must be http(s): ${raw}`);
  }
  const host = parsed.hostname;
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new LocalTargetError(
      "non_loopback",
      `URL host must be a loopback (${[...LOOPBACK_HOSTS].join(", ")}); got "${host}".`,
    );
  }
}

export function targetId(t: LocalTarget): string {
  return t.kind === "url" ? t.url : t.path;
}

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
}

function readRegistry(): Registry {
  const file = paths().localTargetsFile;
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { targets: [] };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { targets: [] };
  }
  const result = RegistrySchema.safeParse(parsed);
  if (!result.success) return { targets: [] };
  return result.data;
}

function writeRegistry(reg: Registry): void {
  const file = paths().localTargetsFile;
  ensureDir(file);
  writeFileSync(file, JSON.stringify(reg, null, 2), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // chmod can fail on some filesystems; the create-mode is the important guarantee
  }
}

export function listTargets(): LocalTarget[] {
  return readRegistry().targets;
}

export function addTarget(t: LocalTarget): { added: boolean } {
  if (t.kind === "url") {
    assertLoopbackUrl(t.url);
  } else {
    if (!t.path) throw new LocalTargetError("invalid_path", "executable path is required");
  }
  const reg = readRegistry();
  const id = targetId(t);
  if (reg.targets.some((existing) => targetId(existing) === id && existing.kind === t.kind)) {
    return { added: false };
  }
  reg.targets.push(t);
  writeRegistry(reg);
  return { added: true };
}

export function removeTarget(id: string): { removed: boolean } {
  const reg = readRegistry();
  const next = reg.targets.filter((t) => targetId(t) !== id);
  if (next.length === reg.targets.length) return { removed: false };
  writeRegistry({ targets: next });
  return { removed: true };
}

export function timeoutMs(t: LocalTarget): number {
  return (t.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
}

export function isAbsolutePath(p: string): boolean {
  return isAbsolute(p);
}
