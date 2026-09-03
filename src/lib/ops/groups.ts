import { apiGet } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

export type GroupRow = {
  /** The group's Dial id — pass it as `--group` when sending or listing. */
  id: string;
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
