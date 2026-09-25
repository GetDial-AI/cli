import { listContacts, listAllContacts, type ContactRow } from "../../lib/ops/contacts.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type ContactsListOptions = {
  /** Only one line's contacts, with that line's counts. */
  numberId?: string;
  /** One page of this size instead of the whole list. Absent means "every contact". */
  limit?: number;
  startingAfter?: string;
  json: boolean;
};

/**
 * The preview line for one contact.
 *
 * The API reports facts, not a sentence, so the wording is chosen here — which also means the
 * terminal and the dashboard can each say it their own way without the server picking for them.
 */
function preview(c: ContactRow): string {
  if (c.lastKind === "call") {
    const direction = c.lastDirection === "inbound" ? "incoming" : "outgoing";
    // 0 seconds means it never connected, so a duration is only worth printing above it.
    return c.lastCallDuration ? `${direction} call, ${c.lastCallDuration}s` : `${direction} call`;
  }
  if (c.lastRedacted) return "(deleted by retention)";
  if (!c.lastBody) return c.lastMediaCount > 0 ? `(${c.lastMediaCount} media)` : "";
  const prefix = c.lastDirection === "inbound" ? "" : "you: ";
  return `${prefix}${c.lastBody}`;
}

export async function runContactsList(opts: ContactsListOptions): Promise<number> {
  try {
    // `--limit` asks for one page and gets exactly that, cursor included. Without it the command
    // answers the question it is named for — who have I talked to — by walking every page.
    const paged = opts.limit !== undefined || opts.startingAfter !== undefined;
    const page = paged
      ? await listContacts({
          numberId: opts.numberId,
          limit: opts.limit,
          startingAfter: opts.startingAfter,
        })
      : { contacts: await listAllContacts(1000, { numberId: opts.numberId }), hasMore: false };

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, contacts: page.contacts, hasMore: page.hasMore }));
      return 0;
    }
    if (page.contacts.length === 0) {
      console.log(
        opts.numberId
          ? "no contacts on that number. a contact appears here once the line texts or calls it."
          : "no contacts. a number appears here once one of your lines texts or calls it.",
      );
      return 0;
    }
    for (const c of page.contacts) {
      const counts = [
        c.messageCount > 0 ? `${c.messageCount} msg` : null,
        c.callCount > 0 ? `${c.callCount} call` : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`${c.number.padEnd(16)}  ${c.lastAt}  ${counts.padEnd(18)}  ${preview(c)}`);
    }
    if (page.hasMore) {
      const cursor = page.contacts[page.contacts.length - 1].lastAt;
      const scope = opts.numberId ? ` --number-id ${opts.numberId}` : "";
      console.log(`\nmore contacts. next page: dial contacts${scope} --starting-after ${cursor}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
