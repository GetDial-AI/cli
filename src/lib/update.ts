import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { appendJsonl, logger } from "./log.ts";
import { paths } from "./paths.ts";
import { defineVersionedFile } from "./versioned-file.ts";

export const AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
export const AUTO_UPDATE_EXEMPT_COMMANDS: ReadonlySet<string> = new Set(["update", "uninstall"]);

/** How this process's CLI got onto the machine — only global-npm is updatable. */
export type InstallKind = "global-npm" | "npx" | "other";

export function detectInstallKind(
  scriptPath: string,
  binOverride = process.env.DIAL_BIN_OVERRIDE,
): InstallKind {
  if (binOverride) return "other";
  let real = scriptPath;
  try {
    real = realpathSync(scriptPath);
  } catch (err) {
    logger.debug({ err, scriptPath }, "could not resolve script path, classifying as-is");
  }
  if (/[/\\]_npx[/\\]/.test(real)) return "npx";
  if (real.includes(`${sep}node_modules${sep}@getdial${sep}cli${sep}`)) return "global-npm";
  return "other";
}

const updateCheckFile = defineVersionedFile<{ lastAttemptAt: string }>({
  dir: () => paths().stateDir,
  base: "update-check",
  version: 1,
  schema: z.object({ lastAttemptAt: z.string() }),
  migrations: {},
});

/** Attempt-based throttle: a persistently failing npm still only retries hourly. */
export function updateCheckDue(now: Date): boolean {
  const stamp = updateCheckFile.read();
  if (!stamp) return true;
  const last = Date.parse(stamp.lastAttemptAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= AUTO_UPDATE_INTERVAL_MS;
}

export function recordUpdateAttempt(now: Date): void {
  updateCheckFile.write({ lastAttemptAt: now.toISOString() });
}

export function shouldAutoUpdate(input: {
  command: string;
  scriptPath: string;
  env: Record<string, string | undefined>;
  now: Date;
}): boolean {
  if (input.env.DIAL_NO_AUTO_UPDATE === "1") return false;
  if (AUTO_UPDATE_EXEMPT_COMMANDS.has(input.command)) return false;
  if (detectInstallKind(input.scriptPath, input.env.DIAL_BIN_OVERRIDE) !== "global-npm")
    return false;
  return updateCheckDue(input.now);
}

/** Prefers the npm sitting next to the running node, like resolveListenCommand does for npx. */
export function npmUpdateCommand(): { command: string; args: string[] } {
  const sibling = join(dirname(process.execPath), "npm");
  return {
    command: existsSync(sibling) ? sibling : "npm",
    args: ["install", "-g", "@getdial/cli@latest"],
  };
}

function packageJsonPath(): string {
  // dist/lib/update.js (or src/lib/update.ts under tsx) → ../../package.json.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
}

/**
 * The version installed on disk right now — unlike VERSION, which is whatever
 * was on disk when this process started. The two diverge after an update.
 */
export function installedVersion(): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath(), "utf8")) as { version: string };
  return pkg.version;
}

/**
 * Failures of the background path go to cli.log, never stdout/stderr — the
 * hook runs under --json consumers and the MCP stdio server.
 */
function logUpdateFailure(context: string, err: unknown): void {
  const line = {
    ts: new Date().toISOString(),
    source: "auto-update",
    context,
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
  };
  try {
    appendJsonl(paths().cliLog, line);
  } catch (logErr) {
    logger.warn({ err, logErr, context }, "auto-update failed and could not write cli.log");
  }
}

/** Spawns the npm update fully detached, stdio appended to cli.log. Never throws. */
export function spawnDetachedUpdate(): void {
  try {
    const p = paths();
    mkdirSync(p.stateDir, { recursive: true });
    const fd = openSync(p.cliLog, "a");
    const { command, args } = npmUpdateCommand();
    const child = spawn(command, args, { detached: true, stdio: ["ignore", fd, fd] });
    child.unref();
    closeSync(fd);
  } catch (err) {
    logUpdateFailure("spawn", err);
  }
}

/**
 * The hourly background check, called from the CLI's preAction hook. Records
 * the attempt before spawning and never throws — a broken update path must
 * not break the command the user actually ran.
 */
export function maybeAutoUpdate(command: string): void {
  try {
    const now = new Date();
    if (!shouldAutoUpdate({ command, scriptPath: process.argv[1] ?? "", env: process.env, now }))
      return;
    recordUpdateAttempt(now);
    spawnDetachedUpdate();
  } catch (err) {
    logUpdateFailure(`check:${command}`, err);
  }
}
