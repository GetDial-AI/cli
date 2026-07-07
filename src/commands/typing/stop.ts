import { setTyping } from "../../lib/ops/typing.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";
import type { TypingOptions } from "./start.ts";

export async function runTypingStop(opts: TypingOptions): Promise<number> {
  try {
    const result = await setTyping({ toNumber: opts.toNumber, value: false, fromNumber: opts.fromNumber });
    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`typing indicator cleared for ${opts.toNumber}.`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
