import { readAuth } from "../../lib/state.ts";
import { apiGet, apiPatch } from "../../lib/api.ts";

type PhoneNumberRow = {
  id: string;
  number: string;
  country: string;
  inboundInstruction: string | null;
};
type ListResponse = { numbers: PhoneNumberRow[] };
type UpdateResponse = { number: PhoneNumberRow };

export type NumberSetOptions = {
  number: string;
  inboundInstruction: string;
  json: boolean;
};

export async function runNumberSet(opts: NumberSetOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  // The REST API keys numbers by id; the CLI takes the E.164 number for ergonomics,
  // so resolve it to its id first.
  const list = await apiGet<ListResponse>("/api/v1/numbers", auth.apiKey);
  if (!list.ok) {
    fail(opts.json, "list_failed", list.error, { status: list.status });
    return 2;
  }

  const match = list.data.numbers.find((n) => n.number === opts.number);
  if (!match) {
    const known = list.data.numbers.map((n) => n.number).join(", ") || "(none)";
    fail(opts.json, "number_not_found", `No phone number ${opts.number} on your account. Yours: ${known}.`);
    return 1;
  }

  const res = await apiPatch<UpdateResponse>(
    `/api/v1/numbers/${match.id}`,
    { inboundInstruction: opts.inboundInstruction },
    auth.apiKey,
  );
  if (!res.ok) {
    fail(opts.json, "update_failed", res.error, { status: res.status });
    return 2;
  }

  const n = res.data.number;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, number: n }));
  } else {
    console.log(`updated.`);
    console.log(`  number:               ${n.number}`);
    console.log(`  id:                   ${n.id}`);
    console.log(`  inbound instruction:  ${n.inboundInstruction ?? ""}`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
