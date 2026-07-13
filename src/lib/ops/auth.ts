import { readAuth, type Auth } from "../state.ts";
import { isSandbox } from "../sandbox.ts";
import { DialError } from "./errors.ts";

/**
 * A keyless sentinel auth used in sandbox mode. `apiKey: ""` is falsy, so
 * `lib/api.ts` attaches no `Authorization` header — the transparent HTTPS
 * proxy (OneCLI) injects the real credential at the network boundary. The
 * other fields are empty because the container has no saved account state;
 * from-number selection must be supplied explicitly via --from-number(-id).
 */
const SANDBOX_AUTH: Auth = { apiKey: "", accountId: "", email: "", phoneNumber: null, phoneNumberId: null };

/**
 * Resolve the saved auth. In sandbox mode, fall back to a keyless sentinel so
 * requests proceed without a locally attached key (the proxy injects it).
 * Otherwise throw a `not_signed_in` DialError.
 */
export function requireAuth(): Auth {
  const auth = readAuth();
  if (auth) return auth;
  if (isSandbox()) return SANDBOX_AUTH;
  throw new DialError("not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
}

/** Resolve the from-number id: explicit override, else the account default, else throw. */
export function requireFromNumberId(auth: Auth, override?: string): string {
  const id = override ?? auth.phoneNumberId;
  if (!id) {
    throw new DialError("no_from_number", "No default phoneNumberId in auth. Pass --from-number-id <id>.");
  }
  return id;
}

/**
 * Resolve a flexible from-number ref (id, owned E.164, or nickname): explicit
 * override, else the saved default number id (an id is a valid ref), else throw.
 */
export function requireFromNumber(auth: Auth, override?: string): string {
  const ref = override ?? auth.phoneNumberId;
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
  auth: Auth,
  opts: { fromNumber?: string; fromNumberId?: string },
): { fromNumber: string } | { fromNumberId: string } {
  if (opts.fromNumber && opts.fromNumberId) {
    throw new DialError("from_number_conflict", "Provide only one of --from-number and --from-number-id.");
  }
  if (opts.fromNumber) return { fromNumber: opts.fromNumber };
  return { fromNumberId: requireFromNumberId(auth, opts.fromNumberId) };
}
