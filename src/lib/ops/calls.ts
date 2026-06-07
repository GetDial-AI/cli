import { apiGet, apiPost } from "../api.ts";
import { requireAuth, requireFromNumberId } from "./auth.ts";
import { DialError } from "./errors.ts";

export type CallRow = {
  id: string;
  phoneNumberId?: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  duration?: number;
  transcript?: string | null;
  instruction: string | null;
  createdAt?: string;
};

export async function placeCall(opts: {
  to: string;
  outboundInstruction: string;
  /** Omitted → the server auto-detects from the destination number's country. */
  language?: string;
  /** Same key across retries → the server returns the already-placed call instead of dialing again. */
  idempotencyKey?: string;
  fromNumberId?: string;
}): Promise<CallRow> {
  const auth = requireAuth();
  const fromNumberId = requireFromNumberId(auth, opts.fromNumberId);
  const res = await apiPost<{ call: CallRow }>(
    "/api/v1/calls",
    {
      to: opts.to,
      fromNumberId,
      outboundInstruction: opts.outboundInstruction,
      ...(opts.language && { language: opts.language }),
    },
    auth.apiKey,
    opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : undefined,
  );
  if (!res.ok) throw new DialError("call_failed", res.error, res.status);
  return res.data.call;
}

export async function listCalls(opts: {
  numberId?: string;
  direction?: string;
  since?: string;
}): Promise<CallRow[]> {
  const auth = requireAuth();
  const params = new URLSearchParams();
  if (opts.numberId) params.set("numberId", opts.numberId);
  if (opts.direction) params.set("direction", opts.direction);
  if (opts.since) params.set("since", opts.since);
  const qs = params.toString();
  const res = await apiGet<{ calls: CallRow[] }>(qs ? `/api/v1/calls?${qs}` : "/api/v1/calls", auth.apiKey);
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return res.data.calls ?? [];
}

export async function getCall(callId: string): Promise<CallRow> {
  const auth = requireAuth();
  const res = await apiGet<{ call: CallRow }>(`/api/v1/calls/${encodeURIComponent(callId)}`, auth.apiKey);
  if (!res.ok) throw new DialError(res.status === 404 ? "not_found" : "get_failed", res.error, res.status);
  return res.data.call;
}
