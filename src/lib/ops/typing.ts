import { apiPost } from "../api.ts";
import { maybeAuth, requireFromNumber } from "./auth.ts";
import { DialError } from "./errors.ts";

/**
 * Show or clear a typing indicator (POST /api/v1/typing). iMessage numbers
 * display it; standard numbers have no typing concept and the server silently
 * no-ops, so calling this unconditionally is safe.
 *
 * Addresses a peer with `toNumber` or a group with `groupId` — exactly one, the same
 * way a send does.
 */
export async function setTyping(opts: {
  /** The peer. Exactly one of this and `groupId`. */
  toNumber?: string;
  /** A group conversation to show it in instead. Exactly one of this and `toNumber`. */
  groupId?: string;
  /** true shows the indicator, false clears it. */
  value: boolean;
  /** Flexible ref: number id, owned E.164, or nickname. Defaults to the onboarded number. */
  fromNumber?: string;
  /**
   * Which rail to show it on, for a line carrying both. Omitted keeps the number's
   * default; omitted with `groupId` because the group already names its channel.
   */
  channel?: "imessage" | "whatsapp";
}): Promise<{ ok: boolean }> {
  const auth = maybeAuth();
  // A group already belongs to one of the account's lines, so a group request needs no
  // from-number — and must not inherit the SAVED DEFAULT one, because the server refuses
  // a from-number that disagrees with the group. Inheriting it would turn the onboarding
  // convenience into a failed request. Exactly the rule a group send follows.
  const from =
    opts.groupId && opts.fromNumber === undefined
      ? {}
      : { fromNumber: requireFromNumber(auth, opts.fromNumber) };
  const res = await apiPost<{ ok: boolean }>(
    "/api/v1/typing",
    {
      // Each destination appears only when given: the server enforces the XOR, and a key
      // present-but-empty reads as a second destination.
      ...(opts.toNumber !== undefined ? { toNumber: opts.toNumber } : {}),
      ...(opts.groupId !== undefined ? { groupId: opts.groupId } : {}),
      value: opts.value,
      ...from,
      // Only when named: the typing schema is strict, so an empty field is a 400.
      ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
    },
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("typing_failed", res.error, res.status);
  return res.data;
}
