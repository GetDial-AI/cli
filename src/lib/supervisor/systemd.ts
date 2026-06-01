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
    // Best-effort status probe. Any failure — systemctl missing, no user session
    // bus (sandbox/container/CI), unit unknown — just means "not running" for our
    // purposes. Log at debug so we never dump a stack trace to a user's stderr;
    // run with DIAL_LOG_LEVEL=debug to see it.
    logger.debug({ err }, "systemctl show failed; treating listen service as not running");
    return { running: false, pid: null };
  }
}

export function lingerEnabled(user: string): boolean {
  try {
    const out = execFileSync("loginctl", ["show-user", user, "--property=Linger"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return /Linger=yes/.test(out);
  } catch (err) {
    // Best-effort; debug only (see systemctlStatus). Assume linger disabled.
    logger.debug({ err, user }, "loginctl show-user failed; assuming linger disabled");
    return false;
  }
}
