import { readAuth } from "../../lib/state.ts";
import { apiGet } from "../../lib/api.ts";

type CallRow = {
  id: string;
  phoneNumberId: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  duration: number;
  transcript: string | null;
  systemPrompt: string | null;
  createdAt: string;
};
type GetResponse = { call: CallRow };

export type CallGetOptions = {
  callId: string;
  json: boolean;
};

export async function runCallGet(opts: CallGetOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  const res = await apiGet<GetResponse>(`/api/v1/calls/${encodeURIComponent(opts.callId)}`, auth.apiKey);
  if (!res.ok) {
    fail(opts.json, res.status === 404 ? "not_found" : "get_failed", res.error, { status: res.status });
    return res.status === 404 ? 1 : 2;
  }

  const c = res.data.call;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, call: c }));
    return 0;
  }

  console.log(`id:         ${c.id}`);
  console.log(`direction:  ${c.direction}`);
  console.log(`from:       ${c.from}`);
  console.log(`to:         ${c.to}`);
  console.log(`status:     ${c.status}`);
  console.log(`duration:   ${c.duration}s`);
  console.log(`created:    ${c.createdAt}`);
  if (c.systemPrompt) {
    console.log(`systemPrompt:`);
    console.log(c.systemPrompt);
  }
  if (c.transcript) {
    console.log(`transcript:`);
    console.log(c.transcript);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
