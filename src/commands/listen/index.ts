import { setTimeout as delay } from "node:timers/promises";
import { readAuth } from "../../lib/state.ts";
import { startWorker } from "../../lib/pubnub.ts";
import { appendJsonl } from "../../lib/log.ts";
import { paths } from "../../lib/paths.ts";

function isSupervised(): boolean {
  return Boolean(process.env.LAUNCHD_SOCKET || process.env.LAUNCH_DAEMON || process.env.INVOCATION_ID);
}

export async function runListen(): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    appendJsonl(paths().listenLog, { ts: new Date().toISOString(), lifecycle: "startup", ok: false, error: "no auth.json" });
    if (isSupervised()) {
      await delay(30_000);
    }
    return 1;
  }

  appendJsonl(paths().listenLog, { ts: new Date().toISOString(), lifecycle: "startup", ok: true, accountId: auth.accountId });

  const ctrl = startWorker(auth.apiKey, auth.accountId);

  const onSignal = async (sig: NodeJS.Signals) => {
    appendJsonl(paths().listenLog, { ts: new Date().toISOString(), lifecycle: "shutdown", signal: sig });
    await ctrl.stop();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  await ctrl.whenStopped;
  const code = process.exitCode;
  return typeof code === "number" ? code : 0;
}
