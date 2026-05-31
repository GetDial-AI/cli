import { readAuth } from "../../lib/state.ts";
import { apiGet } from "../../lib/api.ts";

type MessageRow = {
  id: string;
  phoneNumberId: string;
  from: string;
  to: string;
  body: string;
  direction: string;
  channel: string;
  status: string;
  createdAt: string;
};
type ListResponse = { messages: MessageRow[] };

export type MessageListOptions = {
  numberId?: string;
  direction?: string;
  since?: string;
  json: boolean;
};

export async function runMessageList(opts: MessageListOptions): Promise<number> {
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
  const path = qs ? `/api/v1/messages?${qs}` : "/api/v1/messages";

  const res = await apiGet<ListResponse>(path, auth.apiKey);
  if (!res.ok) {
    fail(opts.json, "list_failed", res.error, { status: res.status });
    return 2;
  }

  const messages = res.data.messages ?? [];
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, messages }));
    return 0;
  }

  if (messages.length === 0) {
    console.log("no messages.");
    return 0;
  }
  for (const m of messages) {
    console.log(`${m.createdAt}  ${m.direction.padEnd(8)}  ${m.from} -> ${m.to}  ${m.body}`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
