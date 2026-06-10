import { execFileSync } from "node:child_process";
import { detectInstallKind, installedVersion, npmUpdateCommand } from "../lib/update.ts";
import { VERSION } from "../lib/version.ts";

export async function runUpdate(opts: { json?: boolean }): Promise<number> {
  const kind = detectInstallKind(process.argv[1] ?? "");
  if (kind !== "global-npm") {
    const guidance =
      kind === "npx"
        ? "npx already runs the latest version on each invocation — nothing to update."
        : "this dial is not a global npm install (source checkout or custom binary) — update it the way it was installed.";
    if (opts.json) console.log(JSON.stringify({ ok: false, error: "not_updatable", kind, message: guidance }));
    else console.error(`update unavailable: ${guidance}`);
    return 2;
  }

  const previous = VERSION;
  const { command, args } = npmUpdateCommand();
  try {
    execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  } catch (err) {
    const e = err as { stderr?: string } & Error;
    const detail = (e.stderr?.trim() || e.message).trim();
    const hint = detail.includes("EACCES")
      ? " (permission denied — fix your npm prefix or re-run with elevated permissions)"
      : "";
    if (opts.json) console.log(JSON.stringify({ ok: false, error: "npm_failed", message: `${detail}${hint}` }));
    else console.error(`update failed: ${detail}${hint}`);
    return 2;
  }

  const installed = installedVersion();
  const updated = installed !== previous;
  if (opts.json) console.log(JSON.stringify({ ok: true, previous, installed, updated }));
  else if (updated) console.log(`updated ${previous} → ${installed}. The new version applies from your next dial command.`);
  else console.log(`already up to date (${previous}).`);
  return 0;
}
