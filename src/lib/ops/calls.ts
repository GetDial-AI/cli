import { apiGet, apiPost } from "../api.ts";
import { maybeAuth, resolveFromSelector } from "./auth.ts";
import { DialError } from "./errors.ts";

/**
 * One uninterrupted stretch of speech by one party, placed in time. Offsets count
 * milliseconds into the call's audio, so the pause before a turn is its
 * `startMs` minus the previous turn's `endMs`.
 *
 * The offsets are approximate: they come from per-word timings the voice runtime
 * does not guarantee to be exact. Ample for spotting a long silence, which is
 * what they are for; not a basis for splitting tenths of a second.
 */
export type TranscriptTurn = {
  /**
   * `agent` is Dial's AI voice agent, `user` the human on the other end, and
   * `transfer_target` the human the call was cold-transferred to, who is a
   * different party from `user`.
   */
  speaker: "agent" | "user" | "transfer_target";
  text: string;
  startMs: number;
  endMs: number;
};

export type CallRow = {
  id: string;
  phoneNumberId?: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  duration?: number;
  transcript?: string | null;
  /**
   * The same conversation as `transcript`, split into timed turns and ordered by
   * `startMs`. Null when the call has no transcript, and on calls that finished
   * before Dial recorded turn timing.
   */
  transcriptTurns?: TranscriptTurn[] | null;
  instruction: string | null;
  transferTo?: string | null;
  transferredAt?: string | null;
  createdAt?: string;
};

export async function placeCall(opts: {
  to: string;
  outboundInstruction: string;
  /** Omitted → the server auto-detects from the destination number's country. */
  language?: string;
  voiceGender?: string;
  /** Forward-to number (E.164): the agent waits for a real human then cold-transfers the call here. */
  transferTo?: string;
  /** Same key across retries → the server returns the already-placed call instead of dialing again. */
  idempotencyKey?: string;
  /** Flexible ref: number id, owned E.164, or nickname. Exclusive with fromNumberId. */
  fromNumber?: string;
  fromNumberId?: string;
  maxCallDurationSeconds?: number;
}): Promise<CallRow> {
  const auth = maybeAuth();
  const from = resolveFromSelector(auth, opts);
  const res = await apiPost<{ call: CallRow }>(
    "/api/v1/calls",
    {
      to: opts.to,
      ...from,
      outboundInstruction: opts.outboundInstruction,
      ...(opts.language && { language: opts.language }),
      // Omitted → the server uses the default voice gender (female).
      ...(opts.voiceGender ? { voiceGender: opts.voiceGender } : {}),
      ...(opts.transferTo ? { transferTo: opts.transferTo } : {}),
      ...(opts.maxCallDurationSeconds !== undefined
        ? { maxCallDurationSeconds: opts.maxCallDurationSeconds }
        : {}),
    },
    auth?.apiKey,
    opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : undefined,
  );
  if (!res.ok) throw new DialError("call_failed", res.error, res.status);
  return res.data.call;
}

export async function listCalls(opts: {
  numberId?: string;
  direction?: string;
  since?: string;
  /**
   * One contact's calls: exchanged with this number, both directions, across every line on the
   * account. Mirrors the same filter on listMessages.
   */
  contact?: string;
}): Promise<CallRow[]> {
  const auth = maybeAuth();
  const params = new URLSearchParams();
  if (opts.numberId) params.set("numberId", opts.numberId);
  if (opts.direction) params.set("direction", opts.direction);
  if (opts.since) params.set("since", opts.since);
  if (opts.contact) params.set("contact", opts.contact);
  const qs = params.toString();
  const res = await apiGet<{ calls: CallRow[] }>(
    qs ? `/api/v1/calls?${qs}` : "/api/v1/calls",
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return res.data.calls ?? [];
}

export async function getCall(callId: string): Promise<CallRow> {
  const auth = maybeAuth();
  const res = await apiGet<{ call: CallRow }>(
    `/api/v1/calls/${encodeURIComponent(callId)}`,
    auth?.apiKey,
  );
  if (!res.ok)
    throw new DialError(res.status === 404 ? "not_found" : "get_failed", res.error, res.status);
  return res.data.call;
}
