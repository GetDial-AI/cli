import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { logger } from "../log.ts";

function isLaunchctlNotFound(err: unknown): boolean {
  const stderr = (err as { stderr?: Buffer | string }).stderr;
  const text = stderr ? stderr.toString() : "";
  return /No such process|could not find specified service|not loaded/i.test(text);
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

// Coerce Buffer fields on Error objects to strings so pino doesn't dump raw byte arrays.
function redactBuffers(err: unknown): unknown {
  if (!err || typeof err !== "object") return err;
  const e = err as Record<string, unknown>;
  const redacted: Record<string, unknown> = { ...e };
  for (const k of ["stderr", "stdout", "output"]) {
    const v = e[k];
    if (Buffer.isBuffer(v)) redacted[k] = v.toString().trim();
    else if (Array.isArray(v)) redacted[k] = v.map((x) => (Buffer.isBuffer(x) ? x.toString().trim() : x));
  }
  return redacted;
}

export const LAUNCHD_LABEL = "ai.getdial.listen";

export function launchdPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

export function renderLaunchdPlist(params: {
  label: string;
  programArgs: string[];
  stdoutPath: string;
  stderrPath: string;
}): string {
  // The dial script uses `#!/usr/bin/env node`. launchd starts with a minimal PATH,
  // so we must prepend the directory of the currently running node (e.g. nvm's bin dir)
  // so the shebang can resolve. Falls back to /usr/local/bin which is where Homebrew puts node.
  const nodeDir = dirname(process.execPath);
  const programArguments = params.programArgs.map((arg) => `    <string>${arg}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${params.label}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${params.stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${params.stderrPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${nodeDir}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
}

export function writeLaunchdPlist(contents: string): { path: string; changed: boolean } {
  const path = launchdPlistPath();
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  const prior = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (prior === contents) return { path, changed: false };
  writeFileSync(path, contents);
  return { path, changed: true };
}

export function launchctlBootoutSilent(): void {
  const uid = process.getuid?.() ?? 0;
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}/${LAUNCHD_LABEL}`], { stdio: "pipe" });
  } catch {
    // Best-effort cleanup before install: launchctl bootout exits non-zero with
    // ambiguous "Boot-out failed: 5: Input/output error" when nothing is loaded.
    // We can't reliably distinguish "not loaded" from real errors, and any real
    // problem will surface on the next bootstrap. Ignore.
  }
}

export function launchctlLoad(plistPath: string): void {
  const uid = process.getuid?.() ?? 0;
  try {
    execFileSync("launchctl", ["bootstrap", `gui/${uid}`, plistPath], { stdio: "pipe" });
    return;
  } catch (bootstrapErr) {
    logger.warn({ err: redactBuffers(bootstrapErr) }, "launchctl bootstrap failed, falling back to legacy load");
  }
  // launchctl load -w prints "Load failed: ..." to stderr but exits 0,
  // so we must inspect stderr ourselves to detect the failure.
  const r = spawnSync("launchctl", ["load", "-w", plistPath], { encoding: "utf8" });
  const stderr = (r.stderr ?? "").trim();
  if (r.error) throw r.error;
  if (r.status !== 0 || /Load failed|error/i.test(stderr)) {
    throw new Error(`launchctl load -w ${plistPath} failed: ${stderr || `exit ${r.status}`}`);
  }
}

export function launchctlUnload(plistPath: string): void {
  const uid = process.getuid?.() ?? 0;
  try {
    execFileSync("launchctl", ["bootout", `gui/${uid}/${LAUNCHD_LABEL}`], { stdio: "pipe" });
  } catch (err) {
    if (!isLaunchctlNotFound(err)) {
      // bootout missing on older macOS — try legacy unload before giving up
      try {
        execFileSync("launchctl", ["unload", plistPath], { stdio: "pipe" });
      } catch (unloadErr) {
        if (!isLaunchctlNotFound(unloadErr)) throw unloadErr;
      }
    }
  }
  try {
    unlinkSync(plistPath);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
}

export function launchctlStatus(): { running: boolean; pid: number | null } {
  try {
    const out = execFileSync("launchctl", ["list"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const line = out.split("\n").find((l) => l.endsWith(`\t${LAUNCHD_LABEL}`) || l.endsWith(` ${LAUNCHD_LABEL}`));
    if (!line) return { running: false, pid: null };
    const cols = line.split(/\s+/);
    const pid = parseInt(cols[0], 10);
    return { running: Number.isFinite(pid) && pid > 0, pid: Number.isFinite(pid) && pid > 0 ? pid : null };
  } catch (err) {
    logger.warn({ err: redactBuffers(err) }, "launchctl list failed");
    return { running: false, pid: null };
  }
}
