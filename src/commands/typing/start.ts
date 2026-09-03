import { setTyping } from "../../lib/ops/typing.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type TypingOptions = {
  toNumber: string;
  /** Flexible ref: number id, owned E.164, or nickname (defaults to onboard's number). */
  fromNumber?: string;
  /** Which rail to show it on, for a line carrying both. */
  channel?: string;
  json: boolean;
};

/** The channels the API accepts. Checked locally so a typo never becomes a 400. */
export const TYPING_CHANNELS = ["imessage", "whatsapp"] as const;

/**
 * Validate `--channel` before any request. Shared by start and stop so the two
 * cannot drift into accepting different words for the same thing.
 */
export function invalidChannel(channel: string | undefined): boolean {
  return channel !== undefined && !TYPING_CHANNELS.includes(channel as (typeof TYPING_CHANNELS)[number]);
}

export async function runTypingStart(opts: TypingOptions): Promise<number> {
  if (invalidChannel(opts.channel)) {
    console.error(`error: --channel must be one of ${TYPING_CHANNELS.join(", ")}.`);
    return 2;
  }
  try {
    const result = await setTyping({
      toNumber: opts.toNumber,
      value: true,
      fromNumber: opts.fromNumber,
      channel: opts.channel as (typeof TYPING_CHANNELS)[number] | undefined,
    });
    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(
        `typing indicator shown to ${opts.toNumber} (iMessage numbers only — SMS numbers ignore it).`,
      );
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
