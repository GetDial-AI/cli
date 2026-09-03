import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { apiGet, apiPost, apiPostMultipart, ApiFormData, type ApiResult } from "../api.ts";
import { maybeAuth, resolveFromSelector } from "./auth.ts";
import { DialError } from "./errors.ts";

export type MessageMediaItem = {
  id: string;
  /** Stable unauthenticated Dial URL serving the media. */
  url: string;
  contentType: string;
  /** Source URL the media came from; null for direct uploads. */
  originalUrl: string | null;
};

export type MessageRow = {
  id: string;
  phoneNumberId?: string;
  /** Who sent it. On an inbound group message, the participant — not the group. */
  from: string;
  /**
   * The destination, and null exactly when `groupId` is set: a group message is
   * addressed to the group, which is not a phone number. Which of the account's
   * numbers the conversation is on is `phoneNumberId`.
   */
  to: string | null;
  /** The group this message belongs to, or null for a one-to-one conversation. */
  groupId?: string | null;
  body: string;
  direction?: string;
  channel: string;
  status: string;
  media?: MessageMediaItem[];
  /** Id of the message this one replies or reacts to; null for ordinary messages. */
  replyToId?: string | null;
  /** The reaction this message carries (a reaction name or an emoji); null otherwise. */
  reaction?: string | null;
  createdAt?: string;
};

export const MAX_MEDIA_ITEMS = 10;

// File extensions the API accepts for uploads, mapped to their MIME type
// (mirrors the server's supported-content-type list).
const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  amr: "audio/amr",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
  vcf: "text/vcard",
  ics: "text/calendar",
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Read a local media file and resolve its MIME type from the extension. */
function readMediaFile(path: string): { data: Buffer; contentType: string; name: string } {
  const ext = extname(path).slice(1).toLowerCase();
  const contentType = EXT_CONTENT_TYPE[ext];
  if (!contentType) {
    const supported = Object.keys(EXT_CONTENT_TYPE).join(", ");
    throw new DialError(
      "unsupported_media",
      `unsupported media file extension ".${ext}" (${path}). Supported: ${supported}`,
    );
  }
  let data: Buffer;
  try {
    data = readFileSync(path);
  } catch (err) {
    throw new DialError(
      "media_read_failed",
      `could not read media file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { data, contentType, name: basename(path) };
}

export async function sendMessage(opts: {
  /** The peer's number. Exclusive with groupId. */
  to?: string;
  /** A group conversation on this account. Exclusive with `to`; the group names the line. */
  groupId?: string;
  /** Optional when media is attached — a media-only send records an empty body. */
  body?: string;
  /** Flexible ref: number id, owned E.164, or nickname. Exclusive with fromNumberId. */
  fromNumber?: string;
  fromNumberId?: string;
  /** Which rail to send on, for a line carrying both. Omitted keeps the number's default. */
  channel?: "imessage" | "whatsapp";
  /** Local file paths and/or public http(s) URLs, in send order (max 10). */
  media?: string[];
  /** Send an audio attachment as a regular file attachment instead of an iMessage voice message. */
  forceAudioFile?: boolean;
}): Promise<MessageRow> {
  const auth = maybeAuth();
  // A group already belongs to one of the account's lines, so a group send needs no
  // from-number — and must not inherit the SAVED DEFAULT one, because the server
  // refuses a from-number that disagrees with the group. Inheriting it would turn
  // the onboarding convenience into a failed send. An explicitly passed one is still
  // forwarded, and still checked server-side.
  const explicitFrom = opts.fromNumber !== undefined || opts.fromNumberId !== undefined;
  const from =
    opts.groupId && !explicitFrom ? {} : resolveFromSelector(auth, opts);
  const media = opts.media ?? [];
  if (media.length > MAX_MEDIA_ITEMS) {
    throw new DialError(
      "too_much_media",
      `at most ${MAX_MEDIA_ITEMS} media items are allowed per message (got ${media.length})`,
    );
  }

  // `channel` is sent only when the caller named one. Omitted, the server uses the
  // from-number's own default (a standard number sends SMS; an iMessage number sends
  // iMessage with RCS/SMS fallback) — and the send schema is strict, so an empty or
  // stale field would be a 400 rather than a no-op.
  // Each destination likewise appears only when given: the server enforces the
  // to/groupId XOR, and a key present-but-empty reads as a second destination.
  // URLs-only goes as plain JSON; any local file switches to multipart.
  const hasFiles = media.some((m) => !isHttpUrl(m));
  let res: ApiResult<{ message: MessageRow }>;
  if (!hasFiles) {
    res = await apiPost<{ message: MessageRow }>(
      "/api/v1/messages",
      {
        ...(opts.to !== undefined ? { to: opts.to } : {}),
        ...(opts.groupId !== undefined ? { groupId: opts.groupId } : {}),
        ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
        ...(opts.body ? { body: opts.body } : {}),
        ...from,
        ...(media.length ? { mediaUrls: media } : {}),
        ...(opts.forceAudioFile ? { forceAudioFile: true } : {}),
      },
      auth?.apiKey,
    );
  } else {
    const form = new ApiFormData();
    if (opts.to !== undefined) form.set("to", opts.to);
    if (opts.groupId !== undefined) form.set("groupId", opts.groupId);
    if (opts.channel !== undefined) form.set("channel", opts.channel);
    if (opts.body) form.set("body", opts.body);
    for (const [field, value] of Object.entries(from)) form.set(field, value);
    if (opts.forceAudioFile) form.set("forceAudioFile", "true");
    for (const item of media) {
      if (isHttpUrl(item)) {
        form.append("mediaUrls", item);
      } else {
        const file = readMediaFile(item);
        form.append(
          "media",
          new Blob([new Uint8Array(file.data)], { type: file.contentType }),
          file.name,
        );
      }
    }
    res = await apiPostMultipart<{ message: MessageRow }>("/api/v1/messages", form, auth?.apiKey);
  }
  if (!res.ok) throw new DialError("send_failed", res.error, res.status);
  return res.data.message;
}

export async function listMessages(opts: {
  numberId?: string;
  /** One group's conversation. Combines with the other filters. */
  groupId?: string;
  direction?: string;
  since?: string;
}): Promise<MessageRow[]> {
  const auth = maybeAuth();
  const params = new URLSearchParams();
  if (opts.numberId) params.set("numberId", opts.numberId);
  if (opts.groupId) params.set("groupId", opts.groupId);
  if (opts.direction) params.set("direction", opts.direction);
  if (opts.since) params.set("since", opts.since);
  const qs = params.toString();
  const res = await apiGet<{ messages: MessageRow[] }>(
    qs ? `/api/v1/messages?${qs}` : "/api/v1/messages",
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("list_failed", res.error, res.status);
  return res.data.messages ?? [];
}

export async function replyToMessage(opts: {
  messageId: string;
  body?: string;
  reaction?: string;
}): Promise<MessageRow> {
  const auth = maybeAuth();
  // No `to`/`fromNumberId`: the server derives both from the target message —
  // the reply stays in the conversation the target is part of.
  const payload: Record<string, string> = {};
  if (opts.body !== undefined) payload.body = opts.body;
  if (opts.reaction !== undefined) payload.reaction = opts.reaction;
  const res = await apiPost<{ message: MessageRow }>(
    `/api/v1/messages/${encodeURIComponent(opts.messageId)}/reply`,
    payload,
    auth?.apiKey,
  );
  if (!res.ok) throw new DialError("reply_failed", res.error, res.status);
  return res.data.message;
}
