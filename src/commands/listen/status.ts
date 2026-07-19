import { readFileSync } from "node:fs";
import { lastEventAtFromLog, supervisorStatus } from "../../lib/supervisor/index.ts";
import { paths } from "../../lib/paths.ts";

export async function runListenStatus(opts: { json?: boolean }): Promise<number> {
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
    /* ignore */
  }

  const out = {
    installed: s.installed,
    running: s.running,
    pid: s.pid,
    unit_path: s.unitPath,
    last_event_at: lastEventAt,
    last_events: lastEvents,
  };

  if (opts.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`installed:     ${out.installed}`);
    console.log(`running:       ${out.running}`);
    console.log(`pid:           ${out.pid ?? "-"}`);
    console.log(`unit:          ${out.unit_path}`);
    console.log(`last event at: ${out.last_event_at ?? "-"}`);
  }
  return 0;
}
