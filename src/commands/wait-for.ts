import { readAuth } from "../lib/state.ts";
import { paths } from "../lib/paths.ts";
import { supervisorStatus } from "../lib/supervisor/index.ts";
import { parseFieldArg, parseRegexArg, type MatchSpec } from "../lib/event-filter.ts";
import { currentSize, findLatestMatch, tailUntilMatch } from "../lib/log-tail.ts";
import { apiPost } from "../lib/api.ts";

export type WaitForOptions = {
  eventType: string;
  fields: string[];
  regexes: string[];
  timeoutSeconds: number;
  json: boolean;
};

const PER_POLL_SECONDS = 30;

export async function runWaitFor(opts: WaitForOptions): Promise<number> {
  const spec: MatchSpec = {
    eventType: opts.eventType,
    fields: opts.fields.map(parseFieldArg),
    regexes: opts.regexes.map(parseRegexArg),
  };

  const status = supervisorStatus();
  if (status.installed && status.running) {
    return waitFromLog(spec, opts);
  }
  return waitFromApi(spec, opts);
}

async function waitFromLog(spec: MatchSpec, opts: WaitForOptions): Promise<number> {
  const file = paths().listenLog;
  const startOffset = currentSize(file);
  const hit = await tailUntilMatch(file, spec, startOffset, opts.timeoutSeconds * 1000);
  if (hit) {
    process.stdout.write(hit.line + "\n");
    return 0;
  }
  const fallback = findLatestMatch(file, spec);
  if (fallback) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, timeout: true, source: "log", event: fallback.obj }));
    } else {
      console.error(`timed out after ${opts.timeoutSeconds}s; latest matching entry in log:`);
      process.stdout.write(fallback.line + "\n");
    }
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: false, timeout: true, source: null, event: null }));
  } else {
    console.error(`timed out after ${opts.timeoutSeconds}s; no matching ${opts.eventType} entry in log.`);
  }
  return 2;
}

async function waitFromApi(spec: MatchSpec, opts: WaitForOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  const filters: Record<string, string> = {};
  for (const f of spec.fields) filters[f.name] = f.value;

  const regexFilters: Record<string, { pattern: string; flags: string }> = {};
  for (const r of spec.regexes) regexFilters[r.name] = { pattern: r.regex.source, flags: r.regex.flags };

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
      auth.apiKey,
    );

    if (res.ok && res.data?.event) {
      process.stdout.write(JSON.stringify(res.data.event) + "\n");
      return 0;
    }
    if (res.ok === false && res.status === 408) {
      continue;
    }
    if (res.ok === false) {
      fail(opts.json, "api_fallback_failed", res.error, { status: res.status });
      return 4;
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: false, timeout: true, source: "api", event: null }));
  } else {
    console.error(`timed out after ${opts.timeoutSeconds}s; no matching ${opts.eventType} via API fallback.`);
  }
  return 2;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
