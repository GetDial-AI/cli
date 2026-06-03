import { existsSync, readFileSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { paths } from "../paths.ts";
import { logger } from "../log.ts";
import { LAUNCHD_LABEL, launchctlBootoutSilent, launchctlLoad, launchctlStatus, launchctlUnload, launchdPlistPath, renderLaunchdPlist, writeLaunchdPlist } from "./launchd.ts";
import { SYSTEMD_UNIT_NAME, lingerEnabled, renderSystemdUnit, systemctlDisable, systemctlEnableAndStart, systemctlStatus, systemdUnitPath, writeSystemdUnit } from "./systemd.ts";

export type Platform = "darwin" | "linux";

export function currentPlatform(): Platform {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  throw new Error(`Unsupported platform: ${process.platform} (macOS and Linux only)`);
}

export type SupervisorAvailability =
  | { available: true }
  | { available: false; reason: string };

/**
 * Detects whether a user-level service supervisor (launchd on macOS,
 * systemd --user on Linux) is reachable on this machine. Returns
 * unavailable for sandboxes / containers / CI runners where the user
 * bus is missing — `dial listen install` would fail there with errors
 * like "Failed to connect to bus: No medium found".
 */
export function supervisorAvailability(): SupervisorAvailability {
  if (process.platform === "darwin") return { available: true };
  if (process.platform !== "linux") {
    return { available: false, reason: `unsupported platform: ${process.platform}` };
  }
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (!runtimeDir) {
    return { available: false, reason: "XDG_RUNTIME_DIR is not set (no systemd user session)" };
  }
  if (!existsSync(`${runtimeDir}/systemd/private`)) {
    return { available: false, reason: "systemd user bus socket not found (sandbox or container without systemd --user)" };
  }
  return { available: true };
}

/**
 * Builds the argv the supervised listen daemon is launched with, baked into
 * the launchd plist / systemd unit. Pure so it can be unit-tested without a
 * real process or filesystem.
 *
 * - `override` (DIAL_BIN_OVERRIDE) always wins, for tests and packaging.
 * - When the current process was launched from npm's ephemeral npx cache
 *   (`~/.npm/_npx/<hash>/…`, e.g. `npx @getdial/cli mcp`), baking that script
 *   path into a long-lived unit is fragile: the cache can be garbage-collected
 *   and the daemon would then point at a path that no longer exists. Re-invoke
 *   through `npx @getdial/cli listen` so each launch re-resolves the CLI.
 * - Otherwise launch the running script directly (`<dial> listen`).
 */
export function buildListenArgs(input: {
  override?: string;
  scriptPath: string;
  nodeDir: string;
  npxExists: boolean;
}): string[] {
  if (input.override) return [input.override, "listen"];
  if (/[/\\]_npx[/\\]/.test(input.scriptPath)) {
    const npx = join(input.nodeDir, "npx");
    return [input.npxExists ? npx : "npx", "-y", "@getdial/cli", "listen"];
  }
  return [input.scriptPath || "dial", "listen"];
}

/** Resolves {@link buildListenArgs} against the live process/environment. */
export function resolveListenCommand(): string[] {
  const nodeDir = dirname(process.execPath);
  return buildListenArgs({
    override: process.env.DIAL_BIN_OVERRIDE,
    scriptPath: process.argv[1] ?? "",
    nodeDir,
    npxExists: existsSync(join(nodeDir, "npx")),
  });
}

export type InstallResult = { changed: boolean; warnings: string[]; unitPath: string };

export function installSupervised(programArgs: string[]): InstallResult {
  const platform = currentPlatform();
  const p = paths();
  if (platform === "darwin") {
    const xml = renderLaunchdPlist({
      label: LAUNCHD_LABEL,
      programArgs,
      stdoutPath: p.listenOutLog,
      stderrPath: p.listenErrLog,
    });
    const { path, changed } = writeLaunchdPlist(xml);
    if (changed) {
      // Boot the prior service out (if any) without deleting the freshly written plist.
      launchctlBootoutSilent();
    }
    launchctlLoad(path);
    return { changed, warnings: [], unitPath: path };
  } else {
    const unit = renderSystemdUnit({ programArgs });
    const { path, changed } = writeSystemdUnit(unit);
    systemctlEnableAndStart();
    const warnings: string[] = [];
    if (!lingerEnabled(userInfo().username)) {
      warnings.push("Run `loginctl enable-linger $USER` so the listen service survives logout.");
    }
    return { changed, warnings, unitPath: path };
  }
}

export function uninstallSupervised(): void {
  const platform = currentPlatform();
  if (platform === "darwin") {
    launchctlUnload(launchdPlistPath());
  } else {
    systemctlDisable();
  }
}

export function supervisorStatus(): { installed: boolean; running: boolean; pid: number | null; unitPath: string } {
  const platform = currentPlatform();
  if (platform === "darwin") {
    const path = launchdPlistPath();
    const installed = existsSync(path);
    const s = launchctlStatus();
    return { installed, running: s.running, pid: s.pid, unitPath: path };
  } else {
    const path = systemdUnitPath();
    const installed = existsSync(path);
    const s = systemctlStatus();
    return { installed, running: s.running, pid: s.pid, unitPath: path };
  }
}

export function lastEventAtFromLog(file: string): string | null {
  let buf: string;
  try {
    if (!statSync(file).isFile()) return null;
    buf = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const lines = buf.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj: { occurredAt?: string; occurred_at?: string; ts?: string };
    try {
      obj = JSON.parse(lines[i]);
    } catch (err) {
      logger.warn({ err, file, lineIndex: i }, "skipping malformed JSONL line in listen log");
      continue;
    }
    const t = obj.occurredAt ?? obj.occurred_at ?? obj.ts;
    if (t) return t;
  }
  return null;
}
