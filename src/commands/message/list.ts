import { listMessages } from "../../lib/ops/messages.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type MessageListOptions = {
  numberId?: string;
  /** One group's conversation. Combines with the other filters. */
  group?: string;
  direction?: string;
  since?: string;
  json: boolean;
};

export async function runMessageList(opts: MessageListOptions): Promise<number> {
  try {
    const messages = await listMessages({
      numberId: opts.numberId,
      groupId: opts.group,
      direction: opts.direction,
      since: opts.since,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, messages }));
      return 0;
    }
    if (messages.length === 0) {
      console.log("no messages.");
      return 0;
    }
    for (const m of messages) {
      const mediaTag = m.media && m.media.length > 0 ? `  [${m.media.length} media]` : "";
      // A group message has no `to`: the destination is the group. Naming it keeps the
      // column meaningful instead of printing an empty slot.
      const destination = m.to ?? `group ${m.groupId}`;
      console.log(
        `${m.createdAt}  ${(m.direction ?? "").padEnd(8)}  ${m.from} -> ${destination}  ${m.body}${mediaTag}`,
      );
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
