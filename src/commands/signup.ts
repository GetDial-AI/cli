import { signup } from "../lib/ops/account.ts";
import { isDialError } from "../lib/ops/errors.ts";

export type SignupOptions = { force?: boolean; json?: boolean };

export async function runSignup(email: string, opts: SignupOptions): Promise<number> {
  try {
    const { verificationId } = await signup({ email, force: opts.force });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, verificationId, email }));
    } else {
      console.log(`OTP sent to ${email}.`);
      console.log(
        `Run \`dial onboard --code <code>\` once you have it (verificationId is stored locally).`,
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
    // signup_failed
    if (opts.json)
      console.log(JSON.stringify({ ok: false, code: e.code, status: e.status, error: e.message }));
    else console.error(`signup failed: ${e.message}`);
    return 2;
  }
}
