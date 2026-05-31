import { readAuth } from "../../lib/state.ts";
import { apiGet } from "../../lib/api.ts";

type PhoneNumberRow = {
  id: string;
  number: string;
  country: string;
  capabilities: string;
  accountId: string;
  createdAt: string;
};
type ListResponse = { numbers: PhoneNumberRow[] };

export type NumberListOptions = { json: boolean };

export async function runNumberList(opts: NumberListOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  const res = await apiGet<ListResponse>("/api/v1/numbers", auth.apiKey);
  if (!res.ok) {
    fail(opts.json, "list_failed", res.error, { status: res.status });
    return 2;
  }

  const numbers = res.data.numbers ?? [];
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, numbers, defaultNumberId: auth.phoneNumberId ?? null }));
    return 0;
  }

  if (numbers.length === 0) {
    console.log("no phone numbers. provision one with `dial number purchase`.");
    return 0;
  }
  for (const n of numbers) {
    const tag = n.id === auth.phoneNumberId ? "  (default)" : "";
    console.log(`${n.number}  id=${n.id}  ${n.country}${tag}`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
