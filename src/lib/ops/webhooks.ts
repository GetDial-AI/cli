import { apiDelete, apiGet, apiPatch, apiPost } from "../api.ts";
import { maybeAuth } from "./auth.ts";
import { DialError } from "./errors.ts";
import { resolveNumberId } from "./numbers.ts";

/**
 * Server webhooks (/api/v1/webhooks): Dial POSTs matching account events to an HTTPS
 * endpoint, signed with the webhook's secret. Custom header and query-parameter values
 * come back masked; the full signing secret only from the /secret endpoint.
 */
export type Webhook = {
  id: string;
  targetUrl: string;
  /** `["*"]` for every event, or the explicit types delivered. */
  eventTypes: string[];
  /** null covers every number; a list covers only those (empty once all were released). */
  phoneNumberIds: string[] | null;
  secretMasked: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  lastPingSucceededAt: string | null;
  createdAt: string;
};

/** The REST body, as the MCP tools take it. On update, null clears and omitted keeps. */
export type WebhookBody = {
  targetUrl?: string;
  eventTypes?: string[];
  phoneNumberIds?: string[] | null;
  headers?: Record<string, string> | null;
  queryParams?: Record<string, string> | null;
};

/** `dial webhook create` flags. */
export type CreateWebhookInput = {
  url: string;
  /** Defaults to every event (`*`). */
  events?: string[];
  /** Number ids, owned E.164s or nicknames; resolved to ids. Defaults to every number. */
  numbers?: string[];
  /** Curl-style `Name: value`. */
  headers?: string[];
  /** `key=value`. */
  query?: string[];
};

/** `dial webhook update` flags. An empty list counts as not given. */
export type UpdateWebhookInput = {
  url?: string;
  events?: string[];
  numbers?: string[];
  allNumbers?: boolean;
  headers?: string[];
  clearHeaders?: boolean;
  query?: string[];
  clearQuery?: boolean;
};

const ALL_EVENTS = ["*"];

function fail(error: string, status: number): never {
  throw new DialError("webhook_failed", error, status);
}

function usage(message: string): never {
  throw new DialError("bad_request", message);
}

/**
 * Split each flag value on its FIRST separator into a map. A missing separator, an empty
 * name, or a name given twice is a usage error: silently keeping only the last of two
 * values would send something the user didn't ask for.
 */
function parsePairs(
  values: string[],
  opts: { flag: string; separator: string; trim: boolean; caseInsensitive: boolean; shape: string },
): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const value of values) {
    const at = value.indexOf(opts.separator);
    const name = at < 0 ? "" : value.slice(0, at).trim();
    if (!name) usage(`${opts.flag} "${value}" must look like ${opts.shape}.`);
    const key = opts.caseInsensitive ? name.toLowerCase() : name;
    if (seen.has(key)) usage(`${opts.flag} ${name} is given more than once.`);
    seen.add(key);
    const rest = value.slice(at + 1);
    out[name] = opts.trim ? rest.trim() : rest;
  }
  return out;
}

/** Header names are case-insensitive, so `X-Key` and `x-key` are the same header. */
export function parseHeaderFlags(values: string[]): Record<string, string> {
  return parsePairs(values, {
    flag: "--header",
    separator: ":",
    trim: true,
    caseInsensitive: true,
    shape: '"Name: value"',
  });
}

export function parseQueryFlags(values: string[]): Record<string, string> {
  return parsePairs(values, {
    flag: "--query",
    separator: "=",
    trim: false,
    caseInsensitive: false,
    shape: "key=value",
  });
}

function exclusive(a: boolean, b: boolean, flags: string): void {
  if (a && b) usage(`Pass either ${flags}, not both.`);
}

async function resolveNumbers(refs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of refs) ids.push(await resolveNumberId(ref));
  return ids;
}

export async function listWebhooks(): Promise<Webhook[]> {
  const res = await apiGet<{ webhooks: Webhook[] }>("/api/v1/webhooks", maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
  return res.data.webhooks;
}

export async function getWebhook(id: string): Promise<Webhook> {
  const res = await apiGet<{ webhook: Webhook }>(
    `/api/v1/webhooks/${encodeURIComponent(id)}`,
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
  return res.data.webhook;
}

export async function postWebhook(body: WebhookBody): Promise<Webhook> {
  const res = await apiPost<{ webhook: Webhook }>("/api/v1/webhooks", body, maybeAuth()?.apiKey);
  if (!res.ok) fail(res.error, res.status);
  return res.data.webhook;
}

export async function patchWebhook(id: string, body: WebhookBody): Promise<Webhook> {
  const res = await apiPatch<{ webhook: Webhook }>(
    `/api/v1/webhooks/${encodeURIComponent(id)}`,
    body,
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
  return res.data.webhook;
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await apiDelete<null>(
    `/api/v1/webhooks/${encodeURIComponent(id)}`,
    undefined,
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
}

/** The full plaintext signing secret (`whsec_…`). */
export async function getWebhookSecret(id: string): Promise<string> {
  const res = await apiGet<{ secret: string }>(
    `/api/v1/webhooks/${encodeURIComponent(id)}/secret`,
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
  return res.data.secret;
}

/** Request a webhook.ping delivery; returns its eventId. Delivery is asynchronous. */
export async function pingWebhook(id: string): Promise<string> {
  const res = await apiPost<{ eventId: string }>(
    `/api/v1/webhooks/${encodeURIComponent(id)}/ping`,
    undefined,
    maybeAuth()?.apiKey,
  );
  if (!res.ok) fail(res.error, res.status);
  return res.data.eventId;
}

export async function createWebhook(input: CreateWebhookInput): Promise<Webhook> {
  const headers = parseHeaderFlags(input.headers ?? []);
  const queryParams = parseQueryFlags(input.query ?? []);
  const numbers = input.numbers ?? [];
  const events = input.events ?? [];
  return postWebhook({
    targetUrl: input.url,
    eventTypes: events.length > 0 ? events : ALL_EVENTS,
    ...(numbers.length > 0 ? { phoneNumberIds: await resolveNumbers(numbers) } : {}),
    ...(input.headers?.length ? { headers } : {}),
    ...(input.query?.length ? { queryParams } : {}),
  });
}

/**
 * Every flag is checked before any request (number resolution included), so a usage
 * error never leaves a half-applied change. --header / --query replace the stored set.
 */
export async function updateWebhook(id: string, input: UpdateWebhookInput): Promise<Webhook> {
  const numbers = input.numbers ?? [];
  const headerFlags = input.headers ?? [];
  const queryFlags = input.query ?? [];
  const events = input.events ?? [];
  exclusive(numbers.length > 0, !!input.allNumbers, "--number or --all-numbers");
  exclusive(headerFlags.length > 0, !!input.clearHeaders, "--header or --clear-headers");
  exclusive(queryFlags.length > 0, !!input.clearQuery, "--query or --clear-query");
  const headers = parseHeaderFlags(headerFlags);
  const queryParams = parseQueryFlags(queryFlags);

  const body: WebhookBody = {};
  if (input.url !== undefined) body.targetUrl = input.url;
  if (events.length > 0) body.eventTypes = events;
  if (input.allNumbers) body.phoneNumberIds = null;
  if (headerFlags.length > 0) body.headers = headers;
  if (input.clearHeaders) body.headers = null;
  if (queryFlags.length > 0) body.queryParams = queryParams;
  if (input.clearQuery) body.queryParams = null;
  if (Object.keys(body).length === 0 && numbers.length === 0)
    usage(
      "Pass at least one of --url, --event, --number, --all-numbers, --header, --clear-headers, --query or --clear-query.",
    );
  if (numbers.length > 0) body.phoneNumberIds = await resolveNumbers(numbers);
  return patchWebhook(id, body);
}
