import { apiGet, apiPost } from "../api.ts";
import { maybeAuth, resolveFromSelector } from "./auth.ts";
import { DialError } from "./errors.ts";

export type GroupRow = {
  /** The group's Dial id — pass it as `--group` when sending or listing. */
  id: string;
  /** The channel the group is on — the same value its messages carry. Never changes. */
  channel: "whatsapp" | "imessage";
  /**
   * The group's current name, or null when no line could report it in time.
   *
   * Dial stores no copy: participants rename groups, so the name is read live from
   * the line holding the conversation. A line that cannot answer yields null here
   * rather than failing the whole listing.
   */
  name: string | null;
  /** When Dial first learned of the group — a join, or its first message. */
  createdAt: string;
};

/**
 * The group conversations the account's lines are in.
 *
 * Shared by `dial group list` and the local MCP `list_groups` tool, so both speak to
 * the API through one place and inherit the saved key the same way.
 */
export async function listGroups(): Promise<GroupRow[]> {
  const auth = maybeAuth();
  const res = await apiGet<{ groups: GroupRow[] }>("/api/v1/groups", auth?.apiKey);
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return res.data.groups ?? [];
}

/** Why a participant asked for at group creation is not in the group. */
export type GroupNotAddedReason = "privacy_restricted" | "not_added";

export type GroupNotAdded = {
  /** The participant, E.164 — null only when the line could not name them. */
  number: string | null;
  /**
   * `privacy_restricted`: their privacy settings only let contacts add them to groups.
   * `not_added`: anything else. Treat an unrecognized value like `not_added`.
   */
  reason: GroupNotAddedReason;
};

export type CreatedGroup = {
  /** The new group, already recorded — its id works with send_message at once. */
  group: GroupRow;
  /** Participants who are not in the group. Empty when everyone was added. */
  notAdded: GroupNotAdded[];
};

/**
 * Create a WhatsApp group from one of the account's lines, which becomes its admin.
 *
 * Shared by `dial group create` and the local MCP `create_group` tool. The from-number
 * defaults to the saved one exactly as a message send does: unlike a group send, a
 * create has no group to name its line, so the onboarding default is the right fill.
 */
export async function createGroup(opts: {
  /** The channel to create the group on. Only "whatsapp" today; omitted, the API defaults to it. */
  channel?: string;
  /** Flexible ref: number id, owned E.164, or nickname. Exclusive with fromNumberId. */
  fromNumber?: string;
  fromNumberId?: string;
  name: string;
  participants: string[];
}): Promise<CreatedGroup> {
  const auth = maybeAuth();
  const from = resolveFromSelector(auth, opts);
  const res = await apiPost<CreatedGroup>(
    "/api/v1/groups",
    {
      ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
      ...from,
      name: opts.name,
      participants: opts.participants,
    },
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("create_failed", res.error, res.status);
  return { group: res.data.group, notAdded: res.data.notAdded ?? [] };
}
