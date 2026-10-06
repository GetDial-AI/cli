import { stopCall, callStatusLabel } from "../../lib/ops/calls.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type CallStopOptions = {
  callId: string;
  json: boolean;
};

export async function runCallStop(opts: CallStopOptions): Promise<number> {
  try {
    const c = await stopCall(opts.callId);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, call: c }));
      return 0;
    }
    console.log(`id:         ${c.id}`);
    console.log(`status:     ${callStatusLabel(c.status)} (stop requested)`);
    console.log(
      `The call ends in a moment. To confirm: dial wait-for call.ended -f callId=${c.id}`,
    );
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
