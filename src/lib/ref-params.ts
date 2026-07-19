import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./paths.ts";
import { logger } from "./log.ts";

// Reads the attribution ref params the install script persisted to
// ${dataDir}/ref-params.txt and returns them base64-encoded for the
// X-Dial-Ref-Params header. The CLI forwards the file verbatim — no parsing, no
// allowlist here; the server decodes + validates. Cached per process (the file is
// write-once and stable for the CLI's lifetime).

let cache: { value: string | null } | undefined;

function compute(): string | null {
  const file = join(paths().dataDir, "ref-params.txt");
  try {
    const text = readFileSync(file, "utf8");
    if (!text.trim()) return null;
    return Buffer.from(text, "utf8").toString("base64");
  } catch (err) {
    // No file is the normal case (the user never went through an attributed
    // install) — not an error worth logging. Anything else is unexpected.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    logger.warn({ err }, "failed to read ref-params.txt");
    return null;
  }
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
