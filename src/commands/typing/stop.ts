import { setTyping } from "../../lib/ops/typing.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";
import {
  invalidChannel,
  invalidDestination,
  destinationLabel,
  TYPING_CHANNELS,
  type TypingOptions,
} from "./start.ts";

export async function runTypingStop(opts: TypingOptions): Promise<number> {
  if (invalidDestination(opts)) {
    console.error("error: provide exactly one of --to-number and --group.");
    return 2;
  }
  if (invalidChannel(opts.channel)) {
    console.error(`error: --channel must be one of ${TYPING_CHANNELS.join(", ")}.`);
    return 2;
  }
  try {
    const result = await setTyping({
      toNumber: opts.toNumber,
      groupId: opts.group,
      value: false,
      fromNumber: opts.fromNumber,
      channel: opts.channel as (typeof TYPING_CHANNELS)[number] | undefined,
    });
    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`typing indicator cleared for ${destinationLabel(opts)}.`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
