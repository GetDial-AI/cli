import { apiGet, apiPost } from "../api.ts";
import { requireAuth, requireFromNumberId } from "./auth.ts";
import { DialError } from "./errors.ts";

export type MessageRow = {
  id: string;
  sid?: string;
  phoneNumberId?: string;
  from: string;
  to: string;
  body: string;
  direction?: string;
  channel: string;
  status: string;
  createdAt?: string;
};

export async function sendMessage(opts: { to: string; body: string; fromNumberId?: string }): Promise<MessageRow> {
  const auth = requireAuth();
  const fromNumberId = requireFromNumberId(auth, opts.fromNumberId);
  const res = await apiPost<{ message: MessageRow }>(
    "/api/v1/messages",
    { to: opts.to, body: opts.body, fromNumberId },
    auth.apiKey,
  );
  if (!res.ok) throw new DialError("send_failed", res.error, res.status);
  return res.data.message;
}

export async function listMessages(opts: {
  numberId?: string;
  direction?: string;
  since?: string;
}): Promise<MessageRow[]> {
  const auth = requireAuth();
  const params = new URLSearchParams();
  if (opts.numberId) params.set("numberId", opts.numberId);
  if (opts.direction) params.set("direction", opts.direction);
  if (opts.since) params.set("since", opts.since);
  const qs = params.toString();
  const res = await apiGet<{ messages: MessageRow[] }>(qs ? `/api/v1/messages?${qs}` : "/api/v1/messages", auth.apiKey);
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return res.data.messages ?? [];
}
