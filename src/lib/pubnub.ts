import PubNub from "pubnub";
import { apiPost } from "./api.ts";
import { appendJsonl, rotateIfLarge } from "./log.ts";
import { paths } from "./paths.ts";
import { fanout } from "./fanout.ts";

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const SUBSCRIBE_PATH = "/api/v1/listen/subscribe";
const REFRESH_FAILURES_BEFORE_EXIT = 3;

type SubscribeCreds = {
  subscribeKey: string;
  channel: string;
  token: string;
  ttlSeconds: number;
};

export async function fetchSubscribeCreds(apiKey: string): Promise<SubscribeCreds> {
  const res = await apiPost<SubscribeCreds>(SUBSCRIBE_PATH, {}, apiKey);
  if (!res.ok) throw new Error(`subscribe failed: ${res.error} (status ${res.status})`);
  return res.data;
}

export type WorkerControls = { stop: () => Promise<void>; whenStopped: Promise<void> };

export function startWorker(apiKey: string, accountId: string): WorkerControls {
  const logFile = paths().listenLog;
  let pn: PubNub | null = null;
  let refreshTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let consecutiveFailures = 0;
  let resolveStopped!: () => void;
  const whenStopped = new Promise<void>((r) => { resolveStopped = r; });

  function logLine(obj: unknown) {
    rotateIfLarge(logFile, MAX_LOG_BYTES);
    appendJsonl(logFile, obj);
  }

  async function refresh(creds: SubscribeCreds) {
    try {
      const next = await fetchSubscribeCreds(apiKey);
      pn?.setToken(next.token);
      consecutiveFailures = 0;
      logLine({ ts: new Date().toISOString(), lifecycle: "token_refresh", ok: true });
      scheduleRefresh(next);
    } catch (err) {
      consecutiveFailures += 1;
      logLine({ ts: new Date().toISOString(), lifecycle: "token_refresh", ok: false, error: err instanceof Error ? err.message : String(err), consecutive_failures: consecutiveFailures });
      if (consecutiveFailures >= REFRESH_FAILURES_BEFORE_EXIT) {
        logLine({ ts: new Date().toISOString(), lifecycle: "shutdown", reason: "refresh_failures_exceeded" });
        await stop();
        process.exitCode = 1;
        return;
      }
      const backoff = Math.min(60, Math.pow(2, consecutiveFailures)) * 1000;
      refreshTimer = setTimeout(() => refresh(creds), backoff);
    }
  }

  function scheduleRefresh(creds: SubscribeCreds) {
    const ms = Math.max(60, Math.floor(creds.ttlSeconds / 2)) * 1000;
    refreshTimer = setTimeout(() => refresh(creds), ms);
  }

  async function stop(): Promise<void> {
    if (stopped) return whenStopped;
    stopped = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    try {
      pn?.unsubscribeAll();
    } catch (err) {
      logLine({ ts: new Date().toISOString(), lifecycle: "shutdown_error", phase: "unsubscribeAll", error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
    }
    try {
      pn?.destroy?.();
    } catch (err) {
      logLine({ ts: new Date().toISOString(), lifecycle: "shutdown_error", phase: "destroy", error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
    }
    resolveStopped();
    return whenStopped;
  }

  (async () => {
    let creds: SubscribeCreds;
    try {
      creds = await fetchSubscribeCreds(apiKey);
    } catch (err) {
      logLine({ ts: new Date().toISOString(), lifecycle: "startup", ok: false, error: err instanceof Error ? err.message : String(err) });
      process.exitCode = 1;
      resolveStopped();
      return;
    }

    pn = new PubNub({
      subscribeKey: creds.subscribeKey,
      // Dashboard, CLI, and SDKs all use the same `dial-{accountId}` identity,
      // so an account counts as one PubNub MAU regardless of surface.
      userId: `dial-${accountId}`,
      ssl: true,
      authKey: creds.token,
    });
    pn.setToken(creds.token);

    pn.addListener({
      message: (ev: { message: unknown }) => {
        logLine({ ts: new Date().toISOString(), ...(ev.message as Record<string, unknown>) });
        void fanout(ev.message, logLine).catch((err) => {
          logLine({ ts: new Date().toISOString(), lifecycle: "fanout_error", error: err instanceof Error ? err.message : String(err) });
        });
      },
      status: (s: { category: string; operation?: string }) => {
        logLine({ ts: new Date().toISOString(), lifecycle: "status", category: s.category, operation: s.operation ?? null });
      },
    });

    pn.subscribe({ channels: [creds.channel] });
    logLine({ ts: new Date().toISOString(), lifecycle: "subscribed", channel: creds.channel });

    scheduleRefresh(creds);
  })();

  return { stop, whenStopped };
}
