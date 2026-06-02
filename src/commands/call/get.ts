import { getCall } from "../../lib/ops/calls.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type CallGetOptions = {
  callId: string;
  json: boolean;
};

export async function runCallGet(opts: CallGetOptions): Promise<number> {
  try {
    const c = await getCall(opts.callId);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, call: c }));
      return 0;
    }
    console.log(`id:         ${c.id}`);
    console.log(`direction:  ${c.direction}`);
    console.log(`from:       ${c.from}`);
    console.log(`to:         ${c.to}`);
    console.log(`status:     ${c.status}`);
    console.log(`duration:   ${c.duration}s`);
    console.log(`created:    ${c.createdAt}`);
    if (c.instruction) {
      console.log(`instruction:`);
      console.log(c.instruction);
    }
    if (c.transcript) {
      console.log(`transcript:`);
      console.log(c.transcript);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
