import { apiGet, apiPost, apiPatch } from "../api.ts";
import { requireAuth } from "./auth.ts";
import { DialError } from "./errors.ts";

export type PhoneNumberRow = {
  id: string;
  number: string;
  nickname?: string | null;
  country: string;
  capabilities?: string;
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
  inboundVoiceGender?: string;
  country?: string;
  areaCode?: string;
}): Promise<PhoneNumberRow> {
  const auth = requireAuth();
  const body: Record<string, unknown> = { inboundInstruction: opts.inboundInstruction };
  if (opts.inboundVoiceGender) body.inboundVoiceGender = opts.inboundVoiceGender;
  if (opts.country) body.country = opts.country;
  if (opts.areaCode) body.areaCode = opts.areaCode;
  const res = await apiPost<{ number: PhoneNumberRow }>("/api/v1/numbers", body, auth.apiKey);
  if (!res.ok) throw new DialError("purchase_failed", res.error, res.status);
  return res.data.number;
}

export async function setNumberProperties(opts: {
  number: string;
  inboundInstruction?: string;
  /** "male"/"female"; an empty string clears it (→ caller-language default). */
  inboundVoiceGender?: string;
  /** Human-readable label for the number; an empty string clears it. */
  nickname?: string;
}): Promise<PhoneNumberRow> {
  const body: Record<string, unknown> = {};
  if (opts.inboundInstruction !== undefined) body.inboundInstruction = opts.inboundInstruction;
  // Empty string clears the override → send null (the enum API rejects "").
  if (opts.inboundVoiceGender !== undefined) body.inboundVoiceGender = opts.inboundVoiceGender || null;
  if (opts.nickname !== undefined) body.nickname = opts.nickname;
  if (Object.keys(body).length === 0) {
    throw new DialError("bad_request", "Provide at least one property to update (inboundInstruction, inboundVoiceGender, or nickname).");
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
