import { readAuth, type Auth } from "../state.ts";
import { DialError } from "./errors.ts";

/** Resolve the saved auth or throw a `not_signed_in` DialError. */
export function requireAuth(): Auth {
  const auth = readAuth();
  if (!auth) {
    throw new DialError("not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
  }
  return auth;
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
