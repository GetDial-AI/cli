import { registerNumber } from "../../lib/ops/account.ts";
import { isDialError } from "../../lib/ops/errors.ts";

/**
 * `dial auth register-number <phone>` — text a verification code to the phone
 * number that will own the account. Required to create an account; never needed to
 * sign in.
 */
export type AuthRegisterNumberOptions = { registrationId?: string; json?: boolean };

const NEXT_COMMAND = "dial auth verify-otp --number --code <code>";

export async function runAuthRegisterNumber(
  phone: string,
  opts: AuthRegisterNumberOptions,
): Promise<number> {
  try {
    const { registrationId, phoneNumber } = await registerNumber({
      registrationId: opts.registrationId,
      phoneNumber: phone,
    });
    if (opts.json) {
      console.log(
        JSON.stringify({ ok: true, registrationId, phoneNumber, nextCommand: NEXT_COMMAND }),
      );
    } else {
      console.log(`code sent to ${phoneNumber}.`);
      console.log(`Ask the user to read it back, then run \`${NEXT_COMMAND}\`.`);
    }
    return 0;
  } catch (e) {
    if (!isDialError(e)) throw e;
    if (opts.json)
      console.log(JSON.stringify({ ok: false, code: e.code, status: e.status, error: e.message }));
    else console.error(`register-number failed: ${e.message}`);
    // A missing registration is the caller's sequencing mistake (1); anything else
    // is a request failure (2).
    return e.code === "no_pending_registration" ? 1 : 2;
  }
}
