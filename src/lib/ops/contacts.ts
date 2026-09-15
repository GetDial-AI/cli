import { apiGet } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

export type ContactRow = {
  /** The contact's number in E.164 — pass it as `--contact` to read the conversation. */
  number: string;
  /**
   * One-to-one messages with this contact across EVERY line on the account, both directions.
   *
   * Group messages are not counted: a group message is addressed to the group, so it belongs to
   * no one-to-one conversation. `dial group list` is where those live.
   */
  messageCount: number;
  /** Calls with this contact across every line on the account, both directions. */
  callCount: number;
  /** When the most recent message or call happened. Also the `--starting-after` cursor value. */
  lastAt: string;
  lastDirection: "inbound" | "outbound";
  /** Which of the two preview fields below carries anything. */
  lastKind: "message" | "call";
  /**
   * The most recent message's text. Empty for a call, for a media-only message, and for one whose
   * content data retention has cleared — `lastKind`, `lastMediaCount` and `lastRedacted` tell
   * those three apart.
   */
  lastBody: string;
  lastMediaCount: number;
  lastRedacted: boolean;
  /** Seconds, or null when the most recent interaction was a message. 0 means it never connected. */
  lastCallDuration: number | null;
};

export type ContactsPage = { contacts: ContactRow[]; hasMore: boolean };

/**
 * One page of contacts — every number the account's lines have messaged or called.
 *
 * Shared by `dial contacts` and the local MCP `list_contacts` tool, so both speak to the API
 * through one place and inherit the saved key the same way.
 */
export async function listContacts(
  opts: {
    limit?: number;
    /** Exclusive ISO-8601 cursor: the `lastAt` of the last contact from the previous page. */
    startingAfter?: string;
  } = {},
): Promise<ContactsPage> {
  const auth = maybeAuth();
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.startingAfter) params.set("starting_after", opts.startingAfter);
  const qs = params.toString();
  const res = await apiGet<ContactsPage>(
    qs ? `/api/v1/contacts?${qs}` : "/api/v1/contacts",
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return { contacts: res.data.contacts ?? [], hasMore: res.data.hasMore ?? false };
}

/**
 * Every contact, following the cursor until the API says there are no more.
 *
 * `dial contacts` answers "who have I talked to", and a first page is not an answer to that — so
 * the default walks the pages. `--limit` opts back into a single page for a caller that wants one.
 */
export async function listAllContacts(pageSize = 1000): Promise<ContactRow[]> {
  const all: ContactRow[] = [];
  let startingAfter: string | undefined;
  // Bounded rather than `while (hasMore)`: a bug at either end that always answered `hasMore:
  // true` would otherwise loop forever against the network. 25 pages is 25,000 contacts.
  for (let page = 0; page < 25; page++) {
    const { contacts, hasMore } = await listContacts({ limit: pageSize, startingAfter });
    all.push(...contacts);
    if (!hasMore || contacts.length === 0) break;
    startingAfter = contacts[contacts.length - 1].lastAt;
  }
  return all;
}
