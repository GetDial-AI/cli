import { listCalls } from "../../lib/ops/calls.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type CallListOptions = {
  numberId?: string;
  direction?: string;
  since?: string;
  json: boolean;
};

export async function runCallList(opts: CallListOptions): Promise<number> {
  try {
    const calls = await listCalls({ numberId: opts.numberId, direction: opts.direction, since: opts.since });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, calls }));
      return 0;
    }
    if (calls.length === 0) {
      console.log("no calls.");
      return 0;
    }
    for (const c of calls) {
      console.log(`${c.createdAt}  ${c.direction.padEnd(8)}  ${c.from} -> ${c.to}  ${c.status}  ${c.duration}s  id=${c.id}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
