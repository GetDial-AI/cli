import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { paths } from "./paths.ts";
import { logger } from "./log.ts";

// Reads the attribution ref params the install script persisted to
// ${dataDir}/ref-params.txt and returns them base64-encoded for the
// X-Dial-Ref-Params header. The CLI forwards the file verbatim — no parsing, no
// allowlist here; the server decodes + validates. Cached per process (the file is
// write-once and stable for the CLI's lifetime).
//
// If the file has no dial_attribution_id, one is minted and appended. That covers
// every install path — `curl … | bash` writes an id itself, but `npm install -g`,
// Homebrew, a prebaked image, or an agent installing the CLI do not, and those
// machines had no attribution spine at all until their eventual signup. Doing it
// here rather than in an installer means there is exactly one code path to cover,
// since every API request already passes through this function.

const ATTRIBUTION_KEY = "dial_attribution_id";

let cache: { value: string | null } | undefined;

/** True when the file already carries an attribution id line. */
function hasAttributionId(text: string): boolean {
  return text.split("\n").some((l) => l.trim().startsWith(`${ATTRIBUTION_KEY}=`));
}

/**
 * Append an attribution id to `text` and persist it. Write-once per key, mirroring
 * the installer's add_ref: a real browser-originated id is never overwritten (the
 * caller checks first).
 *
 * A write failure is warned and swallowed — the id is still returned so a signup in
 * this same process aliases correctly. An unwritable dataDir is already-broken
 * territory the CLI surfaces elsewhere.
 */
function mintAttributionId(file: string, text: string): string {
  const separator = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
  const next = `${text}${separator}${ATTRIBUTION_KEY}=${randomUUID()}\n`;
  try {
    mkdirSync(paths().dataDir, { recursive: true });
    writeFileSync(file, next, "utf8");
  } catch (err) {
    logger.warn({ err }, "couldn't persist the attribution id; using it for this process only");
  }
  return next;
}

function compute(): string | null {
  const file = join(paths().dataDir, "ref-params.txt");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    // No file is the normal case (the user never went through an attributed
    // install) — not an error worth logging. Anything else is unexpected, but
    // still recoverable: treat it as empty and mint below.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logger.warn({ err }, "failed to read ref-params.txt");
    }
    text = "";
  }
  if (!hasAttributionId(text)) text = mintAttributionId(file, text);
  if (!text.trim()) return null;
  return Buffer.from(text, "utf8").toString("base64");
}

/** Base64 of ref-params.txt for the X-Dial-Ref-Params header, or null if absent. */
export function refParamsHeader(): string | null {
  if (!cache) cache = { value: compute() };
  return cache.value;
}

/** Test-only: clear the per-process cache. */
export function resetRefParamsCache(): void {
  cache = undefined;
}
