import { z } from "zod";
import { logger } from "./log.ts";
import { paths } from "./paths.ts";
import { installedVersion } from "./update.ts";
import { defineVersionedFile } from "./versioned-file.ts";
import { VERSION } from "./version.ts";

export const VERSION_POLL_INTERVAL_MS = 60 * 1000;
/** Mismatches must hold this many consecutive ticks — npm may be mid-replace. */
export const SKEW_CONFIRM_TICKS = 2;

const listenVersionFile = defineVersionedFile<{ version: string; pid: number; startedAt: string }>({
  dir: () => paths().stateDir,
  base: "listen-version",
  version: 1,
  schema: z.object({ version: z.string(), pid: z.number(), startedAt: z.string() }),
  migrations: {},
});

/** Non-blocking startup side effect: failure is a warning, never an abort. */
export function recordListenVersion(now = new Date()): void {
  try {
    listenVersionFile.write({ version: VERSION, pid: process.pid, startedAt: now.toISOString() });
  } catch (err) {
    logger.warn({ err }, "could not record the listen service version");
  }
}

/** installedVersion() that reports unreadable/unparsable as null instead of throwing. */
export function safeInstalledVersion(): string | null {
  try {
    return installedVersion();
  } catch (err) {
    logger.warn({ err }, "could not read the installed CLI version");
    return null;
  }
}

export type SkewState = { streak: number };

export function nextSkewState(
  state: SkewState,
  running: string,
  installed: string | null,
): { state: SkewState; restart: boolean } {
  if (installed === null || installed === running) {
    return { state: { streak: 0 }, restart: false };
  }
  const streak = state.streak + 1;
  return { state: { streak }, restart: streak >= SKEW_CONFIRM_TICKS };
}
