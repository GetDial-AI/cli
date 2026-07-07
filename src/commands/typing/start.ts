import { setTyping } from "../../lib/ops/typing.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type TypingOptions = {
  toNumber: string;
  /** Flexible ref: number id, owned E.164, or nickname (defaults to onboard's number). */
  fromNumber?: string;
  json: boolean;
};

export async function runTypingStart(opts: TypingOptions): Promise<number> {
  try {
    const result = await setTyping({ toNumber: opts.toNumber, value: true, fromNumber: opts.fromNumber });
    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`typing indicator shown to ${opts.toNumber} (iMessage numbers only — SMS numbers ignore it).`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
