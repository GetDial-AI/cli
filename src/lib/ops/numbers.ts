import { apiGet, apiPost, apiPatch } from "../api.ts";
import { requireAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

export type PhoneNumberRow = {
  id: string;
  number: string;
  nickname?: string | null;
  country: string;
  capabilities?: string;
  setupStatus?: string;
  accountId?: string;
  createdAt?: string;
  inboundInstruction?: string | null;
  inboundVoiceGender?: string | null;
};

export async function listNumbers(): Promise<{ numbers: PhoneNumberRow[]; defaultNumberId: string | null }> {
  const auth = requireAuth();
  const res = await apiGet<{ numbers: PhoneNumberRow[] }>("/api/v1/numbers", auth.apiKey);
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return { numbers: res.data.numbers ?? [], defaultNumberId: auth.phoneNumberId ?? null };
}

export async function purchaseNumber(opts: {
  inboundInstruction: string;
  /** Required attestation that the account holder consented to provisioning this number programmatically. */
  explicitProgrammaticConsent: string;
  inboundVoiceGender?: string;
  areaCode?: string;
  /** When true, provision an iMessage number (async; setupStatus starts "provisioning"). */
  includeImessage?: boolean;
}): Promise<PhoneNumberRow> {
  const auth = requireAuth();
  const body: Record<string, unknown> = {
    inboundInstruction: opts.inboundInstruction,
    explicitProgrammaticConsent: opts.explicitProgrammaticConsent,
  };
  if (opts.inboundVoiceGender) body.inboundVoiceGender = opts.inboundVoiceGender;
  // iMessage numbers ignore areaCode, so only send it for standard numbers.
  if (opts.includeImessage) body.capabilities = ["sms", "call", "imessage"];
  else if (opts.areaCode) body.areaCode = opts.areaCode;
  const res = await apiPost<{ number: PhoneNumberRow }>("/api/v1/numbers", body, auth.apiKey);
  if (!res.ok) throw new DialError("purchase_failed", res.error, res.status);
  return res.data.number;
}

export async function setNumberProperties(opts: {
  number: string;
  inboundInstruction?: string;
  /** "male"/"female"; an empty string clears it (reverts to the default, female). */
  inboundVoiceGender?: string;
  /** Human-readable label for the number; an empty string clears it. */
  nickname?: string;
  /**
   * Per-number call duration cap in seconds, applied as a hard ceiling to both
   * inbound and outbound calls on the number.
   * Pass `null` to clear; omit to leave unchanged.
   */
  maxCallDurationSeconds?: number | null;
}): Promise<PhoneNumberRow> {
  const body: Record<string, unknown> = {};
  if (opts.inboundInstruction !== undefined) body.inboundInstruction = opts.inboundInstruction;
  // Empty string clears the override → send null (the enum API rejects "").
  if (opts.inboundVoiceGender !== undefined) body.inboundVoiceGender = opts.inboundVoiceGender || null;
  if (opts.nickname !== undefined) body.nickname = opts.nickname;
  if (opts.maxCallDurationSeconds !== undefined) body.maxCallDurationSeconds = opts.maxCallDurationSeconds;
  if (Object.keys(body).length === 0) {
    throw new DialError("bad_request", "Provide at least one property to update (inboundInstruction, inboundVoiceGender, nickname, or maxCallDurationSeconds).");
  }
  const auth = requireAuth();
  // The REST API keys numbers by id; the CLI/tool takes the E.164 number for ergonomics,
  // so resolve it to its id first.
  const list = await apiGet<{ numbers: PhoneNumberRow[] }>("/api/v1/numbers", auth.apiKey);
  if (!list.ok) throw new DialError("list_failed", list.error, list.status);
  const match = list.data.numbers.find((n) => n.number === opts.number);
  if (!match) {
    const known = list.data.numbers.map((n) => n.number).join(", ") || "(none)";
    throw new DialError("number_not_found", `No phone number ${opts.number} on your account. Yours: ${known}.`);
  }
  const res = await apiPatch<{ number: PhoneNumberRow }>(
    `/api/v1/numbers/${match.id}`,
    body,
    auth.apiKey,
  );
  if (!res.ok) throw new DialError("update_failed", res.error, res.status);
  return res.data.number;
}
