import { sendMessage } from "../../lib/ops/messages.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type MessageSendOptions = {
  to?: string;
  /** A group conversation on this account. Exclusive with --to. */
  group?: string;
  /** Optional when --media is given (a media-only send). */
  body?: string;
  /** Flexible ref: number id, owned E.164, or nickname. Exclusive with fromNumberId. */
  fromNumber?: string;
  fromNumberId?: string;
  /** Which rail to send on, for a line carrying both. Omitted keeps the number's default. */
  channel?: string;
  /** Local file paths and/or public http(s) URLs (repeatable --media). */
  media?: string[];
  /** Send an audio attachment as a regular file attachment instead of an iMessage voice message. */
  forceAudioFile?: boolean;
  json: boolean;
};

/** The channels the API accepts. Checked locally so a typo never becomes a 400. */
export const CHANNELS = ["imessage", "whatsapp"] as const;

export async function runMessageSend(opts: MessageSendOptions): Promise<number> {
  // Both destination checks happen BEFORE any HTTP call: a caller who gave two
  // destinations, or none, gets told what to fix rather than a server rejection
  // they have to map back to their own flags.
  if ((opts.to === undefined) === (opts.group === undefined)) {
    console.error("error: provide exactly one of --to and --group.");
    return 2;
  }
  if (opts.channel !== undefined && !CHANNELS.includes(opts.channel as (typeof CHANNELS)[number])) {
    console.error(`error: --channel must be one of ${CHANNELS.join(", ")}.`);
    return 2;
  }
  try {
    const m = await sendMessage({
      to: opts.to,
      groupId: opts.group,
      body: opts.body,
      fromNumber: opts.fromNumber,
      fromNumberId: opts.fromNumberId,
      channel: opts.channel as (typeof CHANNELS)[number] | undefined,
      media: opts.media,
      forceAudioFile: opts.forceAudioFile,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, message: m }));
    } else {
      console.log(`sent.`);
      console.log(`  channel:  ${m.channel}`);
      console.log(`  from:     ${m.from}`);
      // A group message has no `to` — the destination is the group — so print the
      // group instead of an empty line that reads like a bug.
      if (m.groupId) console.log(`  group:    ${m.groupId}`);
      else console.log(`  to:       ${m.to}`);
      console.log(`  body:     ${m.body}`);
      for (const item of m.media ?? []) {
        console.log(`  media:    ${item.url} (${item.contentType})`);
      }
      console.log(`  status:   ${m.status}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
