import { readFileSync } from "node:fs";
import {
  installSupervised,
  uninstallSupervised,
  supervisorStatus,
  supervisorAvailability,
  lastEventAtFromLog,
  resolveListenCommand,
  type InstallResult,
} from "../supervisor/index.ts";
import { paths } from "../paths.ts";
import { requireAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

export function listenInstall(): InstallResult {
  requireAuth();
  const supervisor = supervisorAvailability();
  if (!supervisor.available) {
    throw new DialError("supervisor_unavailable", supervisor.reason);
  }
  try {
    return installSupervised(resolveListenCommand());
  } catch (err) {
    throw new DialError("install_failed", err instanceof Error ? err.message : String(err));
  }
}

export function listenUninstall(): { ok: true } {
  try {
    uninstallSupervised();
    return { ok: true };
  } catch (err) {
    throw new DialError("uninstall_failed", err instanceof Error ? err.message : String(err));
  }
}

export function listenStatus(): {
  installed: boolean;
  running: boolean;
  pid: number | null;
  unitPath: string;
  lastEventAt: string | null;
  lastEvents: unknown[];
} {
  const s = supervisorStatus();
  const lastEventAt = lastEventAtFromLog(paths().listenLog);

  let lastEvents: unknown[] = [];
  try {
    const raw = readFileSync(paths().listenLog, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    lastEvents = lines.slice(-5).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return l;
      }
    });
  } catch {
    // no log yet — leave empty
  }

  return { installed: s.installed, running: s.running, pid: s.pid, unitPath: s.unitPath, lastEventAt, lastEvents };
}
