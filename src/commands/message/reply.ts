import { replyToMessage } from "../../lib/ops/messages.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type MessageReplyOptions = {
  messageId: string;
  /** Reply text. Exactly one of body/react (the caller enforces it). */
  body?: string;
  /** Reaction: love|like|dislike|laugh|emphasize|question or a single emoji. */
  react?: string;
  json: boolean;
};

export async function runMessageReply(opts: MessageReplyOptions): Promise<number> {
  try {
    const m = await replyToMessage({ messageId: opts.messageId, body: opts.body, reaction: opts.react });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, message: m }));
    } else {
      console.log(`sent.`);
      console.log(`  channel:  ${m.channel}`);
      console.log(`  from:     ${m.from}`);
      console.log(`  to:       ${m.to}`);
      console.log(`  body:     ${m.body}`);
      if (m.reaction) console.log(`  reaction: ${m.reaction}`);
      if (m.replyToId) console.log(`  replyTo:  ${m.replyToId}`);
      console.log(`  status:   ${m.status}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
