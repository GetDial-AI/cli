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
type ListResponse = { calls: CallRow[] };

export type CallListOptions = {
  numberId?: string;
  direction?: string;
  since?: string;
  json: boolean;
};

export async function runCallList(opts: CallListOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  const params = new URLSearchParams();
  if (opts.numberId) params.set("numberId", opts.numberId);
  if (opts.direction) params.set("direction", opts.direction);
  if (opts.since) params.set("since", opts.since);
  const qs = params.toString();
  const path = qs ? `/api/v1/calls?${qs}` : "/api/v1/calls";

  const res = await apiGet<ListResponse>(path, auth.apiKey);
  if (!res.ok) {
    fail(opts.json, "list_failed", res.error, { status: res.status });
    return 2;
  }

  const calls = res.data.calls ?? [];
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, calls }));
    return 0;
  }

  if (calls.length === 0) {
    console.log("no calls.");
    return 0;
  }
  for (const c of calls) {
    console.log(`${c.createdAt}  ${c.direction.padEnd(8)}  ${c.from} -> ${c.to}  ${c.status}  ${c.duration}s  id=${c.id}`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
