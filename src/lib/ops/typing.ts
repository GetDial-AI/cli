import { apiPost } from "../api.ts";
import { requireAuth, requireFromNumber } from "./auth.ts";
import { DialError } from "./errors.ts";

/**
 * Show or clear a typing indicator (POST /api/v1/typing). iMessage numbers
 * display it; standard numbers have no typing concept and the server silently
 * no-ops, so calling this unconditionally is safe.
 */
export async function setTyping(opts: {
  toNumber: string;
  /** true shows the indicator, false clears it. */
  value: boolean;
  /** Flexible ref: number id, owned E.164, or nickname. Defaults to the onboarded number. */
  fromNumber?: string;
}): Promise<{ ok: boolean }> {
  const auth = requireAuth();
  const fromNumber = requireFromNumber(auth, opts.fromNumber);
  const res = await apiPost<{ ok: boolean }>(
    "/api/v1/typing",
    { toNumber: opts.toNumber, value: opts.value, fromNumber },
    auth.apiKey,
  );
  if (!res.ok) throw new DialError("typing_failed", res.error, res.status);
  return res.data;
}
