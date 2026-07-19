import { waitForEvent, type WaitForResult } from "../lib/ops/events.ts";
import { isDialError } from "../lib/ops/errors.ts";

export type WaitForOptions = {
  eventType: string;
  fields: string[];
  regexes: string[];
  timeoutSeconds: number;
  json: boolean;
};

export async function runWaitFor(opts: WaitForOptions): Promise<number> {
  let r: WaitForResult;
  try {
    r = await waitForEvent({
      eventType: opts.eventType,
      fields: opts.fields,
      regexes: opts.regexes,
      timeoutSeconds: opts.timeoutSeconds,
    });
  } catch (e) {
    if (!isDialError(e)) throw e;
    // not_signed_in (no auth on the API path) or api_fallback_failed
    fail(opts.json, e.code, e.message, e.status ? { status: e.status } : undefined);
    return e.code === "api_fallback_failed" ? 4 : 1;
  }

  // Hit: print the raw line and succeed.
  if (!r.timedOut && r.line != null) {
    process.stdout.write(`${r.line}\n`);
    return 0;
  }

  // Timed out tailing the log, but there was an earlier matching entry.
  if (r.source === "log" && r.line != null) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, timeout: true, source: "log", event: r.event }));
    } else {
      console.error(`timed out after ${opts.timeoutSeconds}s; latest matching entry in log:`);
      process.stdout.write(`${r.line}\n`);
    }
    return 1;
  }

  // Timed out tailing the log with no prior match at all.
  if (r.source === "log") {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, timeout: true, source: null, event: null }));
    } else {
      console.error(
        `timed out after ${opts.timeoutSeconds}s; no matching ${opts.eventType} entry in log.`,
      );
    }
    return 2;
  }

  // Timed out on the API fallback.
  if (opts.json) {
    console.log(JSON.stringify({ ok: false, timeout: true, source: "api", event: null }));
  } else {
    console.error(
      `timed out after ${opts.timeoutSeconds}s; no matching ${opts.eventType} via API fallback.`,
    );
  }
  return 2;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
