import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { logger } from "../log.ts";

function isSystemctlNotLoaded(err: unknown): boolean {
  const stderr = (err as { stderr?: Buffer | string }).stderr;
  const text = stderr ? stderr.toString() : "";
  return /not loaded|does not exist|Unit .* not found/i.test(text);
}

/**
 * True when the error means systemd simply isn't usable here — no systemctl on
 * PATH, or no user session bus (sandbox / container / CI / non-systemd distro).
 * These are expected on many machines, so they should be logged at debug, not
 * dumped as a scary warning with a full stack trace.
 */
function isSystemdUnavailable(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
  if (e.code === "ENOENT") return true; // systemctl / loginctl not installed
  const stderr = e.stderr ? e.stderr.toString() : "";
  const text = stderr || e.message || "";
  return /Failed to connect to bus|No medium found|XDG_RUNTIME_DIR|not been booted with systemd|Connection refused|Permission denied/i.test(text);
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

export const SYSTEMD_UNIT_NAME = "dial-listen.service";

export function systemdUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT_NAME);
}

export function renderSystemdUnit(params: { programPath: string }): string {
  // systemd user units start with a minimal PATH; include node's bin dir so
  // dial's `#!/usr/bin/env node` shebang resolves.
  const nodeDir = dirname(process.execPath);
  return `[Unit]
Description=Dial listen service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment="PATH=${nodeDir}:/usr/local/bin:/usr/bin:/bin"
ExecStart=${params.programPath} listen
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
}

export function writeSystemdUnit(contents: string): { path: string; changed: boolean } {
  const path = systemdUnitPath();
  mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
  const prior = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (prior === contents) return { path, changed: false };
  writeFileSync(path, contents);
  return { path, changed: true };
}

export function systemctlEnableAndStart(): void {
  execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "pipe" });
  execFileSync("systemctl", ["--user", "enable", "--now", SYSTEMD_UNIT_NAME], { stdio: "pipe" });
}

export function systemctlDisable(): void {
  try {
    execFileSync("systemctl", ["--user", "disable", "--now", SYSTEMD_UNIT_NAME], { stdio: "pipe" });
  } catch (err) {
    if (!isSystemctlNotLoaded(err)) throw err;
  }
  try {
    unlinkSync(systemdUnitPath());
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "pipe" });
}

export function systemctlStatus(): { running: boolean; pid: number | null } {
  try {
    const out = execFileSync("systemctl", ["--user", "show", SYSTEMD_UNIT_NAME, "--property=ActiveState,MainPID"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const active = /ActiveState=active/.test(out);
    const m = out.match(/MainPID=(\d+)/);
    const pid = m ? parseInt(m[1], 10) : 0;
    return { running: active, pid: active && pid > 0 ? pid : null };
  } catch (err) {
    // Expected on machines without a systemd user session — stay quiet there.
    if (isSystemdUnavailable(err)) logger.debug({ err }, "systemd not available; treating listen service as not running");
    else logger.warn({ err }, "systemctl show failed");
    return { running: false, pid: null };
  }
}

export function lingerEnabled(user: string): boolean {
  try {
    const out = execFileSync("loginctl", ["show-user", user, "--property=Linger"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return /Linger=yes/.test(out);
  } catch (err) {
    if (isSystemdUnavailable(err)) logger.debug({ err, user }, "loginctl unavailable; assuming linger disabled");
    else logger.warn({ err, user }, "loginctl show-user failed; assuming linger disabled");
    return false;
  }
}
