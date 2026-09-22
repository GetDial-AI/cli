import { apiGet } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

/**
 * What a phone number can receive.
 *
 * One key per channel, true when the number can be reached there. Channels are
 * added over time, so read the ones you need by name rather than assuming the
 * whole set — an unknown key is a channel this CLI predates, not an error.
 */
export type NumberSupport = {
  imessage: boolean;
  /**
   * `null` when the account has no WhatsApp number of its own: a WhatsApp check is made FROM a
   * WhatsApp line, so Dial answers it only for accounts that have one. It says something about the
   * account, never about the number — it is not a failure and it does not mean unreachable.
   */
  whatsapp: boolean | null;
};

export type NumberLookup = {
  /** The number that was asked about, normalized to E.164. */
  number: string;
  supports: NumberSupport;
};

/**
 * Look a number up.
 *
 * Shared by `dial lookup` and the local MCP `lookup_number` tool, so both speak to
 * the API through one place and inherit the saved key the same way.
 *
 * A lookup Dial could not complete comes back as an error (502), never as a
 * negative verdict — so a `false` here always means the number genuinely is not
 * reachable on that channel, and a `null` always means Dial did not answer for
 * that channel. Neither ever means "we could not find out", and callers can
 * treat all three differently.
 */
export async function lookupNumber(number: string): Promise<NumberLookup> {
  const auth = maybeAuth();
  const res = await apiGet<NumberLookup>(
    `/api/v1/lookup?number=${encodeURIComponent(number)}`,
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("lookup_failed", res.error, res.status);
  return res.data;
}
