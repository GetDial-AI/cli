import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { apiGet, apiPost, apiPatch, apiPatchMultipart, ApiFormData, type ApiResult } from "../api.ts";
import { maybeAuth } from "./auth.ts";
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
  inboundLanguage?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
};

// Image types the avatar upload accepts, keyed by file extension.
const AVATAR_EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Read a local avatar image and resolve its MIME type from the extension. */
function readAvatarFile(path: string): { data: Buffer; contentType: string; name: string } {
  const ext = extname(path).slice(1).toLowerCase();
  const contentType = AVATAR_EXT_CONTENT_TYPE[ext];
  if (!contentType) {
    const supported = Object.keys(AVATAR_EXT_CONTENT_TYPE).join(", ");
    throw new DialError(
      "unsupported_avatar",
      `unsupported avatar file extension ".${ext}" (${path}). Supported: ${supported}`,
    );
  }
  try {
    return { data: readFileSync(path), contentType, name: basename(path) };
  } catch (err) {
    throw new DialError(
      "avatar_read_failed",
      `could not read avatar file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function listNumbers(): Promise<{
  numbers: PhoneNumberRow[];
  defaultNumberId: string | null;
}> {
  const auth = maybeAuth();
  const res = await apiGet<{ numbers: PhoneNumberRow[] }>("/api/v1/numbers", auth?.apiKey);
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return { numbers: res.data.numbers ?? [], defaultNumberId: auth?.phoneNumberId ?? null };
}

export async function purchaseNumber(opts: {
  inboundInstruction: string;
  /** Required attestation that the account holder consented to provisioning this number programmatically. */
  explicitProgrammaticConsent: string;
  inboundVoiceGender?: string;
  /** BCP-47 tag pinning inbound calls to one language; omitted → detected per call. */
  inboundLanguage?: string;
  areaCode?: string;
  /** When true, provision an iMessage number (async; setupStatus starts "provisioning"). */
  includeImessage?: boolean;
}): Promise<PhoneNumberRow> {
  const auth = maybeAuth();
  const body: Record<string, unknown> = {
    inboundInstruction: opts.inboundInstruction,
    explicitProgrammaticConsent: opts.explicitProgrammaticConsent,
  };
  if (opts.inboundVoiceGender) body.inboundVoiceGender = opts.inboundVoiceGender;
  if (opts.inboundLanguage) body.inboundLanguage = opts.inboundLanguage;
  // iMessage numbers ignore areaCode, so only send it for standard numbers.
  if (opts.includeImessage) body.capabilities = ["sms", "call", "imessage"];
  else if (opts.areaCode) body.areaCode = opts.areaCode;
  const res = await apiPost<{ number: PhoneNumberRow }>("/api/v1/numbers", body, auth?.apiKey);
  if (!res.ok) throw new DialError("purchase_failed", res.error, res.status);
  return res.data.number;
}

export async function setNumberProperties(opts: {
  number: string;
  inboundInstruction?: string;
  /** "male"/"female"; an empty string clears it (reverts to the default, female). */
  inboundVoiceGender?: string;
  /** BCP-47 tag pinning inbound calls to one language; an empty string clears it (reverts to per-call detection). */
  inboundLanguage?: string;
  /** Human-readable label for the number; an empty string clears it. */
  nickname?: string;
  /**
   * Per-number call duration cap in seconds, applied as a hard ceiling to both
   * inbound and outbound calls on the number.
   * Pass `null` to clear; omit to leave unchanged.
   */
  maxCallDurationSeconds?: number | null;
  /** iMessage display first name; an empty string clears it. iMessage numbers only. */
  firstName?: string;
  /** iMessage display last name; an empty string clears it. iMessage numbers only. */
  lastName?: string;
  /**
   * iMessage avatar photo (replace-only). A local file path is uploaded as
   * multipart; an http(s) URL is sent for the server to download. iMessage
   * numbers only.
   */
  avatar?: string;
}): Promise<PhoneNumberRow> {
  const body: Record<string, unknown> = {};
  if (opts.inboundInstruction !== undefined) body.inboundInstruction = opts.inboundInstruction;
  // Empty string clears the override → send null (the enum API rejects "").
  if (opts.inboundVoiceGender !== undefined)
    body.inboundVoiceGender = opts.inboundVoiceGender || null;
  if (opts.inboundLanguage !== undefined) body.inboundLanguage = opts.inboundLanguage || null;
  if (opts.nickname !== undefined) body.nickname = opts.nickname;
  if (opts.maxCallDurationSeconds !== undefined)
    body.maxCallDurationSeconds = opts.maxCallDurationSeconds;
  if (opts.firstName !== undefined) body.firstName = opts.firstName;
  if (opts.lastName !== undefined) body.lastName = opts.lastName;
  // A URL avatar goes in the JSON body; a local file forces multipart (below).
  // Read + validate the file up front, before any API round-trip, so a bad
  // path or unsupported type fails fast.
  const avatarFile =
    opts.avatar !== undefined && !isHttpUrl(opts.avatar) ? readAvatarFile(opts.avatar) : null;
  if (opts.avatar !== undefined && !avatarFile) body.avatarUrl = opts.avatar;

  if (Object.keys(body).length === 0 && !avatarFile) {
    throw new DialError(
      "bad_request",
      "Provide at least one property to update (inboundInstruction, inboundVoiceGender, inboundLanguage, nickname, maxCallDurationSeconds, firstName, lastName, or avatar).",
    );
  }
  const auth = maybeAuth();
  // The REST API keys numbers by id; the CLI/tool takes the E.164 number for ergonomics,
  // so resolve it to its id first.
  const list = await apiGet<{ numbers: PhoneNumberRow[] }>("/api/v1/numbers", auth?.apiKey);
  if (!list.ok) throw new DialError("list_failed", list.error, list.status);
  const match = list.data.numbers.find((n) => n.number === opts.number);
  if (!match) {
    const known = list.data.numbers.map((n) => n.number).join(", ") || "(none)";
    throw new DialError(
      "number_not_found",
      `No phone number ${opts.number} on your account. Yours: ${known}.`,
    );
  }
  const path = `/api/v1/numbers/${match.id}`;

  // A local avatar file forces a multipart PATCH: every scalar field goes in as a
  // text part alongside the uploaded `avatar` file. Otherwise a plain JSON PATCH.
  let res: ApiResult<{ number: PhoneNumberRow }>;
  if (avatarFile) {
    const form = new ApiFormData();
    for (const [field, value] of Object.entries(body)) form.set(field, String(value));
    form.append(
      "avatar",
      new Blob([new Uint8Array(avatarFile.data)], { type: avatarFile.contentType }),
      avatarFile.name,
    );
    res = await apiPatchMultipart<{ number: PhoneNumberRow }>(path, form, auth?.apiKey);
  } else {
    res = await apiPatch<{ number: PhoneNumberRow }>(path, body, auth?.apiKey);
  }
  if (!res.ok) throw new DialError("update_failed", res.error, res.status);
  return res.data.number;
}
