import { signup } from "../../lib/ops/account.ts";
import { isDialError } from "../../lib/ops/errors.ts";

/** `dial auth login <email>` — the first step of both signing up and signing in. */
export type AuthLoginOptions = { force?: boolean; json?: boolean };

export async function runAuthLogin(email: string, opts: AuthLoginOptions): Promise<number> {
  try {
    const { verificationId } = await signup({ email, force: opts.force });
    if (opts.json) {
      console.log(
        JSON.stringify({
          ok: true,
          verificationId,
          email,
          // Every step names the next one, so an agent never has to guess the flow.
          nextCommand: "dial auth verify-otp --code <code>",
        }),
      );
    } else {
      console.log(`OTP sent to ${email}.`);
      console.log(
        `Run \`dial auth verify-otp --code <code>\` once you have it (verificationId is stored locally).`,
      );
    }
    return 0;
  } catch (e) {
    if (!isDialError(e)) throw e;
    if (e.code === "pending_exists") {
      const d = e.data ?? {};
      if (opts.json) {
        console.log(
          JSON.stringify({
            ok: false,
            code: "pending_exists",
            verificationId: d.verificationId,
            email: d.email,
            ageSeconds: d.ageSeconds,
          }),
        );
      } else {
        console.error(e.message);
      }
      return 3;
    }
    if (opts.json)
      console.log(JSON.stringify({ ok: false, code: e.code, status: e.status, error: e.message }));
    else console.error(`login failed: ${e.message}`);
    return 2;
  }
}
