import { sendMessage } from "../../lib/ops/messages.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type MessageSendOptions = {
  to: string;
  body: string;
  fromNumberId?: string;
  /** Local file paths and/or public http(s) URLs (repeatable --media). */
  media?: string[];
  json: boolean;
};

export async function runMessageSend(opts: MessageSendOptions): Promise<number> {
  try {
    const m = await sendMessage({ to: opts.to, body: opts.body, fromNumberId: opts.fromNumberId, media: opts.media });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, message: m }));
    } else {
      console.log(`sent.`);
      console.log(`  channel:  ${m.channel}`);
      console.log(`  from:     ${m.from}`);
      console.log(`  to:       ${m.to}`);
      console.log(`  body:     ${m.body}`);
      for (const item of m.media ?? []) {
        console.log(`  media:    ${item.url} (${item.contentType})`);
      }
      console.log(`  status:   ${m.status}`);
      console.log(`  sid:      ${m.sid}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
