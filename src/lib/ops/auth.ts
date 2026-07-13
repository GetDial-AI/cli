import { readAuth, type Auth } from "../state.ts";
import { isSandbox } from "../sandbox.ts";
import { DialError } from "./errors.ts";

/**
 * Resolve the saved auth, or `undefined` when running keyless.
 *
 * - Signed in (auth file present): returns the saved {@link Auth}.
 * - Sandbox mode with no saved auth: returns `undefined`. The container has no
 *   API key — a transparent HTTPS proxy (OneCLI) injects the real credential at
 *   the network boundary, so callers pass `auth?.apiKey` (undefined) and
 *   `lib/api.ts` attaches no `Authorization` header. Account-derived state
 *   (e.g. a default from-number) is likewise absent and must be supplied
 *   explicitly via --from-number(-id).
 * - Not signed in and not sandboxed: throws `not_signed_in`.
 */
export function maybeAuth(): Auth | undefined {
  const auth = readAuth();
  if (auth) return auth;
  if (isSandbox()) return undefined;
  throw new DialError("not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
}

/** Resolve the from-number id: explicit override, else the account default, else throw. */
export function requireFromNumberId(auth: Auth | undefined, override?: string): string {
  const id = override ?? auth?.phoneNumberId;
  if (!id) {
    throw new DialError("no_from_number", "No default phoneNumberId in auth. Pass --from-number-id <id>.");
  }
  return id;
}

/**
 * Resolve a flexible from-number ref (id, owned E.164, or nickname): explicit
 * override, else the saved default number id (an id is a valid ref), else throw.
 */
export function requireFromNumber(auth: Auth | undefined, override?: string): string {
  const ref = override ?? auth?.phoneNumberId;
  if (!ref) {
    throw new DialError("no_from_number", "No default phoneNumberId in auth. Pass --from-number <id|E.164|nickname>.");
  }
  return ref;
}

/**
 * Pick the from-number selector field for send/call requests. `--from-number`
 * (flexible ref) and `--from-number-id` (id only) are mutually exclusive —
 * both given fails fast here, before any request; neither falls back to the
 * saved default id via the legacy field.
 */
export function resolveFromSelector(
  auth: Auth | undefined,
  opts: { fromNumber?: string; fromNumberId?: string },
): { fromNumber: string } | { fromNumberId: string } {
  if (opts.fromNumber && opts.fromNumberId) {
    throw new DialError("from_number_conflict", "Provide only one of --from-number and --from-number-id.");
  }
  if (opts.fromNumber) return { fromNumber: opts.fromNumber };
  return { fromNumberId: requireFromNumberId(auth, opts.fromNumberId) };
}
