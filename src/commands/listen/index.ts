import { setTimeout as delay } from "node:timers/promises";
import { readAuth } from "../../lib/state.ts";
import { startWorker } from "../../lib/pubnub.ts";
import { appendJsonl } from "../../lib/log.ts";
import { paths } from "../../lib/paths.ts";
import {
  nextSkewState,
  recordListenVersion,
  safeInstalledVersion,
  VERSION_POLL_INTERVAL_MS,
  type SkewState,
} from "../../lib/listen-version.ts";
import { VERSION } from "../../lib/version.ts";

function isSupervised(): boolean {
  return Boolean(
    process.env.LAUNCHD_SOCKET || process.env.LAUNCH_DAEMON || process.env.INVOCATION_ID,
  );
}

export async function runListen(): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    appendJsonl(paths().listenLog, {
      ts: new Date().toISOString(),
      lifecycle: "startup",
      ok: false,
      error: "no saved auth",
    });
    if (isSupervised()) {
      await delay(30_000);
    }
    return 1;
  }

  appendJsonl(paths().listenLog, {
    ts: new Date().toISOString(),
    lifecycle: "startup",
    ok: true,
    accountId: auth.accountId,
  });
  recordListenVersion();

  const ctrl = startWorker(auth.apiKey, auth.accountId);

  const onSignal = async (sig: NodeJS.Signals) => {
    appendJsonl(paths().listenLog, {
      ts: new Date().toISOString(),
      lifecycle: "shutdown",
      signal: sig,
    });
    await ctrl.stop();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  // When an update replaces the installed CLI, drain and exit non-zero so the
  // supervisor (launchd KeepAlive / systemd on-failure) relaunches us onto the
  // new code. Exit 1 restarts under both supervisors.
  let skew: SkewState = { streak: 0 };
  const versionPoll = setInterval(() => {
    const installed = safeInstalledVersion();
    const decision = nextSkewState(skew, VERSION, installed);
    skew = decision.state;
    if (decision.restart) {
      clearInterval(versionPoll);
      appendJsonl(paths().listenLog, {
        ts: new Date().toISOString(),
        lifecycle: "restart",
        reason: "version-skew",
        running: VERSION,
        installed,
      });
      process.exitCode = 1;
      void ctrl.stop();
    }
  }, VERSION_POLL_INTERVAL_MS);
  versionPoll.unref();

  await ctrl.whenStopped;
  clearInterval(versionPoll);
  const code = process.exitCode;
  return typeof code === "number" ? code : 0;
}
