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

/**
 * The call's live lifecycle status. The server returns a structured object — a
 * plain `string` only ever shows up on a call fetched before this shape shipped,
 * or from a client that hasn't updated its assumption. Tolerate both.
 */
export type CallStatusObject = {
  state?: string;
  terminationType?: string | null;
  cancelRequested?: boolean;
  cancelPending?: boolean;
  label?: string;
};

export type CallStatus = string | CallStatusObject;

/**
 * Why a call ended as `failed`, when Dial knows. Every reason today comes from a
 * Self-Hosted **audio** target. `null` on every other call, and on a failed call
 * whose cause Dial can't name. More values may be added — treat an unknown one
 * like `null`.
 */
export type CallFailureReason =
  | "self_hosted_key_rejected"
  | "self_hosted_agent_not_found"
  | "self_hosted_at_capacity"
  | "self_hosted_unreachable"
  | null;

export type CallRow = {
  id: string;
  phoneNumberId?: string;
  from: string;
  to: string;
  direction: string;
  status: CallStatus;
  duration?: number;
  /** Set only when `status`'s terminationType is `failed` and Dial knows why; null otherwise. */
  failureReason?: CallFailureReason | string | null;
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

/**
 * The human-facing label for a call's status: `status.label` for the current
 * object shape, `status.state` if a `label` wasn't sent, or the raw string for
 * a call fetched before the object shape shipped. Never returns `[object
 * Object]` — the bug this exists to avoid.
 */
export function callStatusLabel(status: CallStatus): string {
  if (typeof status === "string") return status;
  if (status && typeof status === "object") {
    if (typeof status.label === "string") return status.label;
    if (typeof status.state === "string") return status.state;
    // Neither field present — never fall through to the default object-to-string
    // coercion, which prints the useless (and confusing) "[object Object]".
    return "unknown";
  }
  return String(status);
}

/**
 * One short, human sentence per known `failureReason` code, matching the docs'
 * "When a call fails" table. Returns `null` for a code we don't recognize
 * (including a future addition) — callers print the raw code in that case.
 */
const FAILURE_REASON_DESCRIPTIONS: Record<string, string> = {
  self_hosted_key_rejected:
    "Pipecat Cloud rejected the public key. Save the right key in Self-Hosted settings.",
  self_hosted_agent_not_found:
    "No Pipecat Cloud agent has that name. Check agentName against your pcc-deploy.toml.",
  self_hosted_at_capacity: "Your agent had no room for another session. Raise max_agents.",
  self_hosted_unreachable:
    "Your server didn't accept the connection, or Pipecat Cloud didn't answer. Check that your server or agent is up.",
};

export function describeFailureReason(reason: string): string | null {
  return FAILURE_REASON_DESCRIPTIONS[reason] ?? null;
}

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

/**
 * End a call that hasn't finished: a Queued or Ringing call is cancelled before it
 * connects, an In-Progress one is hung up. POST /api/v1/calls/<id>/stop.
 *
 * Resolves as soon as the stop is accepted, with `status.cancelPending: true` — the
 * call reaches Terminated a moment later (wait for `call.ended` to confirm). A 400
 * means the call had already ended.
 */
export async function stopCall(callId: string): Promise<CallRow> {
  const auth = maybeAuth();
  const res = await apiPost<{ call: CallRow }>(
    `/api/v1/calls/${encodeURIComponent(callId)}/stop`,
    {},
    auth?.apiKey,
  );
  if (!res.ok) {
    const code =
      res.status === 404 ? "not_found" : res.status === 400 ? "already_ended" : "stop_failed";
    throw new DialError(code, res.error, res.status);
  }
  return res.data.call;
}
