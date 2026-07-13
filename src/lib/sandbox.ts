import { existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./paths.ts";
import { supervisorAvailability } from "./supervisor/index.ts";

/**
 * "Sandbox mode" is the Dial CLI running inside an ephemeral agent container
 * (e.g. NanoClaw) where:
 *   - there is no saved auth file / raw API key — a transparent HTTPS proxy
 *     (OneCLI) injects the real `Authorization` header for api.getdial.ai, so
 *     the CLI must send requests keyless and let the proxy add auth;
 *   - there is no service supervisor (no launchd / no `systemd --user`), so
 *     machine-lifecycle commands (`listen`, `update`, `uninstall`, …) are
 *     meaningless and only confuse the agent;
 *   - onboarding/signup/mcp make no sense — the container is pre-provisioned.
 *
 * Detection precedence (see {@link computeSandbox}):
 *   1. Explicit override via DIAL_SANDBOX ("1"/"true" → on, "0"/"false" → off).
 *   2. Inference: no supervisor AND HTTPS_PROXY set AND no `.not-sandbox`
 *      sentinel in the Dial data dir.
 *
 * The result is memoized: computed once per process.
 */

/** Commands (and their subcommands) disabled in sandbox mode. */
export const SANDBOX_DISABLED_COMMANDS = [
  "listen",
  "signup",
  "onboard",
  "local-target",
  "mcp",
  "update",
  "uninstall",
] as const;

export type SandboxState = { sandbox: boolean; reason: string };

/** Absolute path of the opt-out sentinel file: `<dialDataDir>/.not-sandbox`. */
export function sentinelPath(): string {
  return join(paths().dataDir, ".not-sandbox");
}

/** Parse the DIAL_SANDBOX override. Returns undefined for unset/unrecognized values. */
function parseOverride(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return undefined;
}

/** existsSync for the sentinel, treating any filesystem error as "absent". */
function sentinelExists(): boolean {
  try {
    return existsSync(sentinelPath());
  } catch {
    return false;
  }
}

/** Pure computation of sandbox state from the current env/filesystem. Not memoized. */
export function computeSandbox(): SandboxState {
  const override = parseOverride(process.env.DIAL_SANDBOX);
  if (override === true) return { sandbox: true, reason: "forced on via DIAL_SANDBOX" };
  if (override === false) return { sandbox: false, reason: "forced off via DIAL_SANDBOX" };

  if (supervisorAvailability().available) {
    return { sandbox: false, reason: "service supervisor available" };
  }
  const httpsProxy = (process.env.HTTPS_PROXY ?? "").trim();
  if (!httpsProxy) return { sandbox: false, reason: "HTTPS_PROXY not set" };
  if (sentinelExists()) return { sandbox: false, reason: `${sentinelPath()} sentinel present` };

  return { sandbox: true, reason: "inferred: HTTPS_PROXY set + no service supervisor" };
}

let cached: SandboxState | undefined;

/** Memoized sandbox state (computed once per process). */
export function sandboxState(): SandboxState {
  if (cached === undefined) cached = computeSandbox();
  return cached;
}

/** Whether the CLI is running in sandbox mode. Memoized. */
export function isSandbox(): boolean {
  return sandboxState().sandbox;
}

/** The message shown when a disabled command is invoked in sandbox mode. */
export function sandboxDisabledMessage(command: string): string {
  const { reason } = sandboxState();
  return (
    `'dial ${command}' is disabled in sandbox mode (${reason}). ` +
    `To run it here, set DIAL_SANDBOX=0 or create ${sentinelPath()}.`
  );
}

/** Reset the memoized state. Test-only — the CLI never mutates it at runtime. */
export function resetSandboxCacheForTests(): void {
  cached = undefined;
}
