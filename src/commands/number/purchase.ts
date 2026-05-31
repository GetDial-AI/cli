import { readAuth } from "../../lib/state.ts";
import { apiPost } from "../../lib/api.ts";

type PhoneNumberRow = { id: string; number: string; country: string };
type PurchaseResponse = { number: PhoneNumberRow };

export type NumberPurchaseOptions = {
  country?: string;
  areaCode?: string;
  json: boolean;
};

export async function runNumberPurchase(opts: NumberPurchaseOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  const body: Record<string, unknown> = {};
  if (opts.country) body.country = opts.country;
  if (opts.areaCode) body.areaCode = opts.areaCode;

  const res = await apiPost<PurchaseResponse>("/api/v1/numbers", body, auth.apiKey);
  if (!res.ok) {
    fail(opts.json, "purchase_failed", res.error, { status: res.status });
    return 2;
  }

  const n = res.data.number;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, number: n }));
  } else {
    console.log(`purchased.`);
    console.log(`  number:   ${n.number}`);
    console.log(`  id:       ${n.id}`);
    console.log(`  country:  ${n.country}`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
