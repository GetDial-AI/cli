import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../state.ts";
import { startMockApi } from "../../test-utils.ts";
import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  getWebhookSecret,
  listWebhooks,
  pingWebhook,
  updateWebhook,
  type UpdateWebhookInput,
} from "./webhooks.ts";
import { isDialError } from "./errors.ts";

let tmp: string;
let api: { url: string; close: () => Promise<void> };
const seen: { method: string; url: string; body: unknown }[] = [];

const WEBHOOK = {
  id: "wh_1",
  targetUrl: "https://example.com/hooks/dial",
  eventTypes: ["*"],
  phoneNumberIds: null,
  secretMasked: "whsec_••••ab12",
  headers: { Authorization: "Bear••••oken" },
  queryParams: {},
  lastPingSucceededAt: null,
  createdAt: "2026-11-20T00:00:00.000Z",
};
const NUMBERS = [
  { id: "pn_1", number: "+14155550101", nickname: "Main", country: "US" },
  { id: "pn_2", number: "+14155550102", nickname: "Ops", country: "US" },
];

async function mock(
  route?: (m: string, u: string) => { status: number; json: unknown } | undefined,
) {
  api = await startMockApi((m, u, body) => {
    seen.push({ method: m, url: u, body: body ? JSON.parse(body) : undefined });
    const custom = route?.(m, u);
    if (custom) return custom;
    if (m === "GET" && u === "/api/v1/numbers") return { status: 200, json: { numbers: NUMBERS } };
    if (m === "GET" && u === "/api/v1/webhooks")
      return { status: 200, json: { webhooks: [WEBHOOK] } };
    if (m === "GET" && u === "/api/v1/webhooks/wh_1/secret")
      return { status: 200, json: { secret: "whsec_full" } };
    if (m === "POST" && u === "/api/v1/webhooks/wh_1/ping")
      return { status: 202, json: { eventId: "evt_1" } };
    if (m === "DELETE" && u === "/api/v1/webhooks/wh_1") return { status: 204, json: null };
    if (u.startsWith("/api/v1/webhooks"))
      return { status: m === "POST" ? 201 : 200, json: { webhook: WEBHOOK } };
    return undefined;
  });
  process.env.DIAL_API_URL = api.url;
}

function requests(): string[] {
  return seen.map((s) => `${s.method} ${s.url}`);
}

describe("ops/webhooks", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-webhooks-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    seen.length = 0;
    writeAuth({
      apiKey: "sk_live_x",
      accountId: "a",
      email: "e",
      phoneNumber: "+14155550101",
      phoneNumberId: "pn_1",
    });
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    delete process.env.DIAL_API_URL;
  });

  it("lists and gets webhooks", async () => {
    await mock();
    assert.deepEqual(await listWebhooks(), [WEBHOOK]);
    assert.deepEqual(await getWebhook("wh_1"), WEBHOOK);
    assert.deepEqual(requests(), ["GET /api/v1/webhooks", "GET /api/v1/webhooks/wh_1"]);
  });

  it("reveals the secret, pings, and deletes", async () => {
    await mock();
    assert.equal(await getWebhookSecret("wh_1"), "whsec_full");
    assert.equal(await pingWebhook("wh_1"), "evt_1");
    await deleteWebhook("wh_1");
    assert.deepEqual(requests(), [
      "GET /api/v1/webhooks/wh_1/secret",
      "POST /api/v1/webhooks/wh_1/ping",
      "DELETE /api/v1/webhooks/wh_1",
    ]);
  });

  it("creates a webhook for every event and every number by default", async () => {
    await mock();
    await createWebhook({ url: "https://example.com/hooks/dial" });
    assert.deepEqual(requests(), ["POST /api/v1/webhooks"]);
    assert.deepEqual(seen[0].body, {
      targetUrl: "https://example.com/hooks/dial",
      eventTypes: ["*"],
    });
  });

  it("creates a scoped webhook, resolving numbers and parsing headers and query params", async () => {
    await mock();
    await createWebhook({
      url: "https://example.com/hooks/dial",
      events: ["message.received", "call.ended"],
      numbers: ["+14155550101", "Ops"],
      headers: ["Authorization:  Bearer a:b:c ", "X-Tenant:acme"],
      query: ["token=abc=def", "empty="],
    });
    const posts = seen.filter((s) => s.method === "POST");
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].body, {
      targetUrl: "https://example.com/hooks/dial",
      eventTypes: ["message.received", "call.ended"],
      phoneNumberIds: ["pn_1", "pn_2"],
      headers: { Authorization: "Bearer a:b:c", "X-Tenant": "acme" },
      queryParams: { token: "abc=def", empty: "" },
    });
  });

  it("refuses a malformed --header or --query before calling the API", async () => {
    await mock();
    for (const input of [
      { url: "https://example.com", headers: ["NoColon"] },
      { url: "https://example.com", headers: [": value"] },
      { url: "https://example.com", query: ["novalue"] },
      { url: "https://example.com", query: ["=value"] },
      // A repeated name would otherwise silently keep only the last value.
      { url: "https://example.com", headers: ["X-Key: a", "x-key: b"] },
      { url: "https://example.com", query: ["k=a", "k=b"] },
    ]) {
      await assert.rejects(createWebhook(input), (e) => isDialError(e) && e.code === "bad_request");
    }
    assert.equal(seen.length, 0);
  });

  it("updates only the given fields", async () => {
    await mock();
    await updateWebhook("wh_1", { url: "https://example.com/v2" });
    await updateWebhook("wh_1", { events: ["call.ended"] });
    await updateWebhook("wh_1", { numbers: ["Ops"] });
    await updateWebhook("wh_1", { allNumbers: true });
    await updateWebhook("wh_1", { headers: ["X-Tenant: acme"] });
    await updateWebhook("wh_1", { clearHeaders: true, query: ["k=v"] });
    await updateWebhook("wh_1", { clearQuery: true });
    const patches = seen.filter((s) => s.method === "PATCH");
    assert.ok(patches.every((p) => p.url === "/api/v1/webhooks/wh_1"));
    assert.deepEqual(
      patches.map((p) => p.body),
      [
        { targetUrl: "https://example.com/v2" },
        { eventTypes: ["call.ended"] },
        { phoneNumberIds: ["pn_2"] },
        { phoneNumberIds: null },
        { headers: { "X-Tenant": "acme" } },
        { headers: null, queryParams: { k: "v" } },
        { queryParams: null },
      ],
    );
  });

  it("refuses an empty update or a contradictory pair before calling the API", async () => {
    await mock();
    const bad: UpdateWebhookInput[] = [
      {},
      { numbers: [], headers: [], query: [], events: [] },
      { numbers: ["Ops"], allNumbers: true },
      { headers: ["X-A: 1"], clearHeaders: true },
      { query: ["a=1"], clearQuery: true },
      { headers: ["bad"] },
    ];
    for (const input of bad) {
      await assert.rejects(
        updateWebhook("wh_1", input),
        (e) => isDialError(e) && e.code === "bad_request",
      );
    }
    assert.equal(seen.length, 0);
  });

  it("surfaces a rejected request's message as a DialError", async () => {
    await mock((m, u) =>
      m === "POST" && u === "/api/v1/webhooks"
        ? { status: 400, json: { error: "targetUrl must use https" } }
        : undefined,
    );
    await assert.rejects(
      createWebhook({ url: "http://example.com" }),
      (e) => isDialError(e) && e.status === 400 && /https/.test(e.message),
    );
  });
});
