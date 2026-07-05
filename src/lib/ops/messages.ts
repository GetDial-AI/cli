import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { apiGet, apiPost, apiPostMultipart, ApiFormData } from "../api.ts";
import { requireAuth, requireFromNumberId } from "./auth.ts";
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
  from: string;
  to: string;
  body: string;
  direction?: string;
  channel: string;
  status: string;
  media?: MessageMediaItem[];
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
    throw new DialError("unsupported_media", `unsupported media file extension ".${ext}" (${path}). Supported: ${supported}`);
  }
  let data: Buffer;
  try {
    data = readFileSync(path);
  } catch (err) {
    throw new DialError("media_read_failed", `could not read media file ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { data, contentType, name: basename(path) };
}

export async function sendMessage(opts: {
  to: string;
  /** Optional when media is attached — a media-only send records an empty body. */
  body?: string;
  fromNumberId?: string;
  /** Local file paths and/or public http(s) URLs, in send order (max 10). */
  media?: string[];
  /** Send an audio attachment as a regular file attachment instead of an iMessage voice message. */
  forceAudioFile?: boolean;
}): Promise<MessageRow> {
  const auth = requireAuth();
  const fromNumberId = requireFromNumberId(auth, opts.fromNumberId);
  const media = opts.media ?? [];
  if (media.length > MAX_MEDIA_ITEMS) {
    throw new DialError("too_much_media", `at most ${MAX_MEDIA_ITEMS} media items are allowed per message (got ${media.length})`);
  }

  // No `channel`: the server determines it from the from-number (a standard number
  // sends SMS; an iMessage number sends iMessage with RCS/SMS fallback) and its send
  // schema is strict — sending a stale `channel` field is rejected as a 400.
  // URLs-only goes as plain JSON; any local file switches to multipart.
  const hasFiles = media.some((m) => !isHttpUrl(m));
  let res;
  if (!hasFiles) {
    res = await apiPost<{ message: MessageRow }>(
      "/api/v1/messages",
      {
        to: opts.to,
        ...(opts.body ? { body: opts.body } : {}),
        fromNumberId,
        ...(media.length ? { mediaUrls: media } : {}),
        ...(opts.forceAudioFile ? { forceAudioFile: true } : {}),
      },
      auth.apiKey,
    );
  } else {
    const form = new ApiFormData();
    form.set("to", opts.to);
    if (opts.body) form.set("body", opts.body);
    form.set("fromNumberId", fromNumberId);
    if (opts.forceAudioFile) form.set("forceAudioFile", "true");
    for (const item of media) {
      if (isHttpUrl(item)) {
        form.append("mediaUrls", item);
      } else {
        const file = readMediaFile(item);
        form.append("media", new Blob([new Uint8Array(file.data)], { type: file.contentType }), file.name);
      }
    }
    res = await apiPostMultipart<{ message: MessageRow }>("/api/v1/messages", form, auth.apiKey);
  }
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
