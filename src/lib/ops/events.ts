import { paths } from "../paths.ts";
import { supervisorStatus } from "../supervisor/index.ts";
import { parseFieldArg, parseRegexArg, type MatchSpec } from "../event-filter.ts";
import { currentSize, findLatestMatch, tailUntilMatch } from "../log-tail.ts";
import { apiPost } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

const PER_POLL_SECONDS = 30;

export type WaitForInput = {
  eventType: string;
  fields: string[];
  regexes: string[];
  timeoutSeconds: number;
};

export type WaitForResult = {
  /** "log" when read from the local listen log, "api" via the long-poll fallback, null when the log had no match at all. */
  source: "log" | "api" | null;
  timedOut: boolean;
  event: Record<string, unknown> | null;
  /** The exact text to print to stdout for a hit/fallback (raw log line, or JSON for the API path); null otherwise. */
  line: string | null;
};

/**
 * Wait for a matching account event. Tails the local listen log when the daemon is
 * running, otherwise long-polls the REST API. Console-free: returns what to print and
 * whether it timed out; throws DialError for auth/API failures.
 */
export async function waitForEvent(opts: WaitForInput): Promise<WaitForResult> {
  const spec: MatchSpec = {
    eventType: opts.eventType,
    fields: opts.fields.map(parseFieldArg),
    regexes: opts.regexes.map(parseRegexArg),
  };

  const status = supervisorStatus();
  if (status.installed && status.running) return waitFromLog(spec, opts);
  return waitFromApi(spec, opts);
}

async function waitFromLog(spec: MatchSpec, opts: WaitForInput): Promise<WaitForResult> {
  const file = paths().listenLog;
  const startOffset = currentSize(file);
  const hit = await tailUntilMatch(file, spec, startOffset, opts.timeoutSeconds * 1000);
  if (hit) return { source: "log", timedOut: false, event: hit.obj, line: hit.line };

  const fallback = findLatestMatch(file, spec);
  if (fallback) return { source: "log", timedOut: true, event: fallback.obj, line: fallback.line };
  return { source: null, timedOut: true, event: null, line: null };
}

async function waitFromApi(spec: MatchSpec, opts: WaitForInput): Promise<WaitForResult> {
  const auth = maybeAuth();

  const filters: Record<string, string> = {};
  for (const f of spec.fields) filters[f.name] = f.value;
  const regexFilters: Record<string, { pattern: string; flags: string }> = {};
  for (const r of spec.regexes)
    regexFilters[r.name] = { pattern: r.regex.source, flags: r.regex.flags };

  const deadline = Date.now() + opts.timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const remainingSec = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    const timeout = Math.min(PER_POLL_SECONDS, remainingSec);

    const res = await apiPost<{ event: unknown }>(
      "/api/v1/events/wait",
      {
        eventType: spec.eventType,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        regexFilters: Object.keys(regexFilters).length > 0 ? regexFilters : undefined,
        timeout,
      },
      auth?.apiKey,
    );

    if (res.ok && res.data?.event) {
      return {
        source: "api",
        timedOut: false,
        event: res.data.event as Record<string, unknown>,
        line: JSON.stringify(res.data.event),
      };
    }
    if (res.ok === false && res.status === 408) continue;
    if (res.ok === false) throw new DialError("api_fallback_failed", res.error, res.status);
  }

  return { source: "api", timedOut: true, event: null, line: null };
}
