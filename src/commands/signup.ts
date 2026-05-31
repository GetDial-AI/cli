import { readPendingSignup, writePendingSignup } from "../lib/state.ts";
import { apiPost } from "../lib/api.ts";

const PENDING_FRESH_MS = 10 * 60 * 1000;

export type SignupOptions = { force?: boolean; json?: boolean };

export async function runSignup(email: string, opts: SignupOptions): Promise<number> {
  const existing = readPendingSignup();
  if (existing && !opts.force) {
    const age = Date.now() - Date.parse(existing.createdAt);
    if (Number.isFinite(age) && age < PENDING_FRESH_MS) {
      const ageS = Math.round(age / 1000);
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, code: "pending_exists", verificationId: existing.verificationId, email: existing.email, ageSeconds: ageS }));
      } else {
        console.error(`A pending OTP for ${existing.email} is still fresh (${ageS}s old). Use \`dial onboard --code <code>\` or re-run with --force to start a new one.`);
      }
      return 3;
    }
  }

  const res = await apiPost<{ verificationId: string }>("/api/v1/auth/signup", { email });
  if (!res.ok) {
    if (opts.json) console.log(JSON.stringify({ ok: false, code: "signup_failed", status: res.status, error: res.error }));
    else console.error(`signup failed: ${res.error}`);
    return 2;
  }

  writePendingSignup({ verificationId: res.data.verificationId, email, createdAt: new Date().toISOString() });

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, verificationId: res.data.verificationId, email }));
  } else {
    console.log(`OTP sent to ${email}.`);
    console.log(`Run \`dial onboard --code <code>\` once you have it (verificationId is stored locally).`);
  }
  return 0;
}
