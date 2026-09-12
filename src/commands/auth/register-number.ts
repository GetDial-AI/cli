import { registerNumber, verifyNumber, PHONE_ALREADY_VERIFIED_CODE } from "../../lib/ops/account.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { reportOnboarded } from "./verify-otp.ts";

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

    // The number is already verified: a previous attempt got the code accepted and
    // stopped before the account existed. There is no code to send and none to ask
    // for, so finish the signup here rather than reporting a failure the caller
    // cannot act on — re-running this command is precisely how someone stuck in
    // that state tries to get unstuck, and telling them to start over sends them
    // round a loop, since a fresh signup returns this same registration.
    //
    // Safe to do unprompted: the user asked to register THIS number and it is the
    // number already verified, so finishing is what they asked for. Nothing is sent
    // and nothing is charged.
    if (e.code === PHONE_ALREADY_VERIFIED_CODE) {
      const registrationId = (e.data?.registrationId as string | undefined) ?? opts.registrationId;
      try {
        const result = await verifyNumber({ registrationId });
        if (!opts.json) {
          console.log(`${phone} is already verified — finishing the signup.`);
        }
        // Reported exactly as `verify-otp --number` reports it, down to the
        // finalization block, so an agent that lands here follows the same script
        // as one that arrived the ordinary way.
        return reportOnboarded(result, !!opts.json);
      } catch (resumeErr) {
        if (!isDialError(resumeErr)) throw resumeErr;
        if (opts.json) {
          console.log(
            JSON.stringify({
              ok: false,
              code: resumeErr.code,
              status: resumeErr.status,
              error: resumeErr.message,
            }),
          );
        } else {
          console.error(`register-number failed: ${resumeErr.message}`);
        }
        return 2;
      }
    }

    if (opts.json)
      console.log(JSON.stringify({ ok: false, code: e.code, status: e.status, error: e.message }));
    else console.error(`register-number failed: ${e.message}`);
    // A missing registration is the caller's sequencing mistake (1); anything else
    // is a request failure (2).
    return e.code === "no_pending_registration" ? 1 : 2;
  }
}
