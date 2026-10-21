import { rotateKey } from "../../lib/ops/account.ts";
import { isDialError } from "../../lib/ops/errors.ts";

/**
 * `dial auth rotate-key`: give the signed-in API key a new secret. The old value
 * stops working immediately; the new one is saved locally and printed once so
 * the user can update anything else that used the old key.
 */
export type AuthRotateKeyOptions = { json?: boolean };

export async function runAuthRotateKey(opts: AuthRotateKeyOptions): Promise<number> {
  try {
    const rotated = await rotateKey();
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...rotated }));
    } else {
      console.log("API key rotated. The old key no longer works.");
      console.log(`New key: ${rotated.apiKey}`);
      console.log(
        "It's saved for this CLI. Copy it now to update anything else that used the old key",
      );
      console.log(
        "(deployed apps, environment variables, other machines). It won't be shown again.",
      );
    }
    return 0;
  } catch (e) {
    if (!isDialError(e)) throw e;
    if (opts.json)
      console.log(
        JSON.stringify({ ok: false, code: e.code, status: e.status, error: e.message, ...e.data }),
      );
    else console.error(`rotate-key failed: ${e.message}`);
    // Not signed in is the caller's sequencing mistake (1); anything else is a
    // request or local failure (2).
    return e.code === "not_signed_in" ? 1 : 2;
  }
}
