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
