import { readAuth } from "../../lib/state.ts";
import { installSupervised, supervisorAvailability } from "../../lib/supervisor/index.ts";

function resolveDialPath(): string {
  return process.env.DIAL_BIN_OVERRIDE ?? process.argv[1] ?? "dial";
}

export async function runListenInstall(opts: { json?: boolean }): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "not_signed_in" }));
    else console.error("Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }
  const supervisor = supervisorAvailability();
  if (!supervisor.available) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "supervisor_unavailable", error: supervisor.reason }));
    else console.error(`listen install unavailable: ${supervisor.reason}. This machine has no user-level service supervisor (sandbox/container/CI). Inbound events still work via \`dial wait-for\`; only the always-on background listener and \`dial local-target\` fan-out are unavailable here.`);
    return 2;
  }
  try {
    const result = installSupervised(resolveDialPath());
    if (opts.json) console.log(JSON.stringify({ ok: true, changed: result.changed, unit_path: result.unitPath, warnings: result.warnings }));
    else {
      console.log(`listen service installed${result.changed ? "" : " (no change)"}.`);
      console.log(`  unit: ${result.unitPath}`);
      for (const w of result.warnings) console.log(`  ! ${w}`);
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "install_failed", error: msg }));
    else console.error(`listen install failed: ${msg}`);
    return 2;
  }
}
