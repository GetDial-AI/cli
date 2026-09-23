import { setTyping } from "../../lib/ops/typing.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type TypingOptions = {
  /** The peer. Exactly one of this and `group`. */
  toNumber?: string;
  /** A group conversation to show it in instead. Exactly one of this and `toNumber`. */
  group?: string;
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
  return (
    channel !== undefined && !TYPING_CHANNELS.includes(channel as (typeof TYPING_CHANNELS)[number])
  );
}

/**
 * Exactly one destination, checked locally so the mistake is named in the user's own
 * words rather than coming back as a server 400. Shared by start and stop, like the
 * channel check, so the two cannot drift.
 */
export function invalidDestination(opts: TypingOptions): boolean {
  return (opts.toNumber === undefined) === (opts.group === undefined);
}

/** How a destination is described back to the user, once, in both verbs. */
export function destinationLabel(opts: TypingOptions): string {
  return opts.group ? `group ${opts.group}` : `${opts.toNumber}`;
}

export async function runTypingStart(opts: TypingOptions): Promise<number> {
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
      value: true,
      fromNumber: opts.fromNumber,
      channel: opts.channel as (typeof TYPING_CHANNELS)[number] | undefined,
    });
    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(
        `typing indicator shown to ${destinationLabel(opts)} (iMessage numbers only — SMS numbers ignore it).`,
      );
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
