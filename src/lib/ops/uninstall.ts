import { existsSync, rmSync } from "node:fs";
import { paths } from "../paths.ts";
import { SUPPORTED_AGENTS, uninstallSkill, type UninstallSkillResult } from "../skill-install.ts";
import {
  supervisorAvailability,
  uninstallSupervised,
  type SupervisorAvailability,
} from "../supervisor/index.ts";

export const UNINSTALL_HINT = "npm uninstall -g @getdial/cli";

export type UninstallReport = {
  ok: boolean;
  daemon: { status: "removed" | "skipped" | "failed"; reason?: string };
  skills: UninstallSkillResult[];
  dirs: { path: string; removed: boolean }[];
  hint: string;
  errors: { step: string; message: string }[];
};

export type UninstallDeps = {
  availability: () => SupervisorAvailability;
  uninstallDaemon: () => void;
  home?: string;
  cwd?: string;
};

/**
 * Full local teardown, best-effort: every step runs even if an earlier one
 * fails, and failures are collected into `errors`. Spec §A.
 */
export function uninstallEverything(deps: Partial<UninstallDeps> = {}): UninstallReport {
  const availability = deps.availability ?? supervisorAvailability;
  const uninstallDaemon = deps.uninstallDaemon ?? uninstallSupervised;
  const errors: UninstallReport["errors"] = [];

  let daemon: UninstallReport["daemon"];
  const supervisor = availability();
  if (!supervisor.available) {
    daemon = { status: "skipped", reason: supervisor.reason };
  } else {
    try {
      uninstallDaemon();
      daemon = { status: "removed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      daemon = { status: "failed", reason: message };
      errors.push({ step: "daemon", message });
    }
  }

  const skills: UninstallSkillResult[] = [];
  for (const agent of SUPPORTED_AGENTS) {
    try {
      skills.push(uninstallSkill(agent, { home: deps.home, cwd: deps.cwd }));
    } catch (err) {
      errors.push({
        step: `skill:${agent}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const p = paths();
  const dirs: UninstallReport["dirs"] = [];
  for (const dir of [p.configDir, p.dataDir, p.stateDir]) {
    try {
      const existed = existsSync(dir);
      if (existed) rmSync(dir, { recursive: true, force: true });
      dirs.push({ path: dir, removed: existed });
    } catch (err) {
      dirs.push({ path: dir, removed: false });
      errors.push({
        step: `dir:${dir}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: errors.length === 0, daemon, skills, dirs, hint: UNINSTALL_HINT, errors };
}
