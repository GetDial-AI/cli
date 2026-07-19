import type { DialError } from "./ops/errors.ts";

// Codes that map to exit 1 (caller/precondition problems); everything else is 2
// (operation failure). Matches the exit codes the commands used before the ops refactor.
const EXIT_1_CODES = new Set([
  "not_signed_in",
  "no_from_number",
  "number_not_found",
  "not_found",
  "no_pending_signup",
  "bad_request",
]);

/**
 * Print a DialError the way the generic REST commands always have — `--json` emits
 * `{ok:false, code, message, status?}`, human mode prints the message to stderr — and
 * return the matching exit code. Commands with bespoke error JSON (signup, onboard,
 * wait-for) handle their own printing instead.
 */
export function printDialError(json: boolean, e: DialError): number {
  if (json) {
    console.log(
      JSON.stringify({
        ok: false,
        code: e.code,
        message: e.message,
        ...(e.status ? { status: e.status } : {}),
      }),
    );
  } else {
    console.error(e.message);
  }
  return EXIT_1_CODES.has(e.code) ? 1 : 2;
}
