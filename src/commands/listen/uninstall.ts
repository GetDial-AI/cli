import { uninstallSupervised } from "../../lib/supervisor/index.ts";

export async function runListenUninstall(opts: { json?: boolean }): Promise<number> {
  try {
    uninstallSupervised();
    if (opts.json) console.log(JSON.stringify({ ok: true }));
    else console.log("listen service uninstalled.");
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) console.log(JSON.stringify({ ok: false, error: msg }));
    else console.error(`listen uninstall failed: ${msg}`);
    return 2;
  }
}
