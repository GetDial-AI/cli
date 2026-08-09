import { VERSION } from "./version.ts";

// Identifies the CLI on every request, so server-side request logs attribute
// provisioning (and everything else) to the client + version that made the call.
const STOCK_USER_AGENT = `@getdial/cli/${VERSION}`;

// A caller-supplied token longer than this is almost certainly a bug, and an
// unbounded one would bloat every server-side request log line it appears in.
const MAX_PREFIX_LENGTH = 128;

/**
 * Reduce a caller-supplied identifier to something safe to put in a header.
 *
 * This never throws and never rejects: the prefix is telemetry, so a malformed
 * value degrades to no prefix at all rather than failing the request. That
 * matters concretely — undici refuses a header value containing CR/LF, so
 * passing one through unsanitized would turn a cosmetic misconfiguration into a
 * hard failure of every Dial call the host makes.
 *
 * Returns "" when there is nothing usable left.
 */
export function sanitizeUserAgent(raw: string | undefined | null): string {
  if (!raw) return "";
  return (
    raw
      // Anything outside printable ASCII — CR, LF, tabs, other control chars, and
      // non-ASCII bytes — becomes a space, in one pass.
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_PREFIX_LENGTH)
      // Truncation can land mid-gap and leave a trailing space behind.
      .trim()
  );
}

/**
 * The full User-Agent for an outgoing API request.
 *
 * `DIAL_USER_AGENT` lets an embedding host runtime (an agent platform, a
 * product wrapping the CLI) identify itself: its token is *prepended*, and the
 * CLI's own identifier is always still sent. Unset or unusable, the header goes
 * out exactly as it always has.
 *
 * Read at call time, not at module load — like `baseUrl()` reading
 * DIAL_API_URL, so the environment is still honored if it changes after import.
 */
export function userAgent(): string {
  const prefix = sanitizeUserAgent(process.env.DIAL_USER_AGENT);
  return prefix ? `${prefix} ${STOCK_USER_AGENT}` : STOCK_USER_AGENT;
}
