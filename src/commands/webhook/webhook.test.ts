import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAuth } from "../../lib/state.ts";
import { startMockApi } from "../../test-utils.ts";
import type { Webhook } from "../../lib/ops/webhooks.ts";
import { formatWebhookDetail } from "./format.ts";
import {
  runWebhookCreate,
  runWebhookDelete,
  runWebhookGet,
  runWebhookList,
  runWebhookPing,
  runWebhookSecret,
  runWebhookUpdate,
} from "./index.ts";

// `dial webhook …`: the human block for one webhook, and each runner's output and exit code.

const WEBHOOK: Webhook = {
  id: "wh_1",
  targetUrl: "https://example.com/hooks/dial",
  eventTypes: ["message.received", "call.ended"],
  phoneNumberIds: ["pn_1", "pn_2"],
  secretMasked: "whsec_••••ab12",
  headers: { Authorization: "Bear••••oken", "X-Tenant": "••••••••" },
  queryParams: { token: "tok_••••4xyz" },
  lastPingSucceededAt: "2026-11-21T10:00:00.000Z",
  createdAt: "2026-11-20T00:00:00.000Z",
};

describe("formatWebhookDetail", () => {
  it("shows the id, URL, events, numbers, masked headers and query params, and last ping", () => {
    const text = formatWebhookDetail(WEBHOOK);
    assert.match(text, /wh_1/);
    assert.match(text, /https:\/\/example\.com\/hooks\/dial/);
    assert.match(text, /message\.received, call\.ended/);
    assert.match(text, /pn_1, pn_2/);
    assert.match(text, /Authorization: Bear••••oken/);
    assert.match(text, /X-Tenant: ••••••••/);
    assert.match(text, /token=tok_••••4xyz/);
    assert.match(text, /2026-11-21T10:00:00\.000Z/);
  });

  it("tells every-number apart from a list whose numbers were all released", () => {
    const all = formatWebhookDetail({ ...WEBHOOK, phoneNumberIds: null });
    const released = formatWebhookDetail({ ...WEBHOOK, phoneNumberIds: [] });
    assert.notEqual(numbersLine(all), numbersLine(released));
    assert.doesNotMatch(all, /pn_1/);
  });

  it("prints nothing masked when there are no custom headers or query params", () => {
    const text = formatWebhookDetail({ ...WEBHOOK, headers: {}, queryParams: {} });
    assert.doesNotMatch(text, /Authorization|token=/);
  });
});

function numbersLine(text: string): string | undefined {
  return text.split("\n").find((l) => l.trimStart().startsWith("numbers:"));
}

let tmp: string;
let api: { url: string; close: () => Promise<void> } | undefined;
let logged: string[];
let errored: string[];
let requests: string[];
const realLog = console.log;
const realError = console.error;

async function mock(): Promise<void> {
  api = await startMockApi((m, u) => {
    requests.push(`${m} ${u}`);
    if (m === "GET" && u === "/api/v1/webhooks")
      return { status: 200, json: { webhooks: [WEBHOOK] } };
    if (m === "GET" && u === "/api/v1/webhooks/wh_1/secret")
      return { status: 200, json: { secret: "whsec_full" } };
    if (m === "POST" && u === "/api/v1/webhooks/wh_1/ping")
      return { status: 202, json: { eventId: "evt_1" } };
    if (m === "DELETE" && u === "/api/v1/webhooks/wh_1") return { status: 204, json: null };
    if (u === "/api/v1/webhooks/missing") return { status: 404, json: { error: "Not found" } };
    if (u.startsWith("/api/v1/webhooks"))
      return { status: m === "POST" ? 201 : 200, json: { webhook: WEBHOOK } };
    return undefined;
  });
  process.env.DIAL_API_URL = api.url;
}

describe("dial webhook runners", () => {
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "dial-webhook-cmd-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    writeAuth({
      apiKey: "sk",
      accountId: "a",
      email: "e",
      phoneNumber: "+14155550101",
      phoneNumberId: "pn_1",
    });
    logged = [];
    errored = [];
    requests = [];
    console.log = (...a: unknown[]) => void logged.push(a.join(" "));
    console.error = (...a: unknown[]) => void errored.push(a.join(" "));
    await mock();
  });
  afterEach(async () => {
    console.log = realLog;
    console.error = realError;
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    api = undefined;
    delete process.env.DIAL_API_URL;
  });

  it("list --json prints the webhooks", async () => {
    assert.equal(await runWebhookList({ json: true }), 0);
    const out = JSON.parse(logged[0]);
    assert.deepEqual({ ok: out.ok, webhooks: out.webhooks }, { ok: true, webhooks: [WEBHOOK] });
    assert.match(out.hint, /\/dashboard\/webhooks\?new=1/);
    assert.match(out.hint, /\/dashboard\/webhooks\?edit=wh_1/);
  });

  it("list prints each webhook's details, then the dashboard links", async () => {
    assert.equal(await runWebhookList({ json: false }), 0);
    assert.match(
      logged.join("\n"),
      /wh_1[\s\S]*Authorization: Bear••••oken[\s\S]*\/dashboard\/webhooks\?edit=wh_1/,
    );
  });

  it("get --json prints the webhook with its dashboard links; create --json prints it alone", async () => {
    assert.equal(await runWebhookGet({ id: "wh_1", json: true }), 0);
    assert.equal(await runWebhookCreate({ url: "https://example.com/hooks/dial", json: true }), 0);
    const [got, created] = logged.map((l) => JSON.parse(l));
    assert.deepEqual({ ok: got.ok, webhook: got.webhook }, { ok: true, webhook: WEBHOOK });
    assert.match(got.hint, /\/dashboard\/webhooks\?edit=wh_1/);
    assert.deepEqual(created, { ok: true, webhook: WEBHOOK });
  });

  it("get prints the dashboard edit link after the webhook", async () => {
    assert.equal(await runWebhookGet({ id: "wh_1", json: false }), 0);
    assert.match(logged.join("\n"), /^wh_1[\s\S]*\/dashboard\/webhooks\?edit=wh_1/);
  });

  it("update prints the updated webhook", async () => {
    assert.equal(await runWebhookUpdate({ id: "wh_1", clearQuery: true, json: false }), 0);
    assert.deepEqual(requests, ["PATCH /api/v1/webhooks/wh_1"]);
    assert.match(logged.join("\n"), /wh_1/);
  });

  it("delete --json reports the deleted id", async () => {
    assert.equal(await runWebhookDelete({ id: "wh_1", json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), { ok: true, deleted: true, webhookId: "wh_1" });
  });

  it("secret prints the bare secret, so it can be piped", async () => {
    assert.equal(await runWebhookSecret({ id: "wh_1", json: false }), 0);
    assert.deepEqual(logged, ["whsec_full"]);
  });

  it("ping --json prints the eventId", async () => {
    assert.equal(await runWebhookPing({ id: "wh_1", json: true }), 0);
    assert.deepEqual(JSON.parse(logged[0]), { ok: true, eventId: "evt_1" });
  });

  it("a malformed --header is a usage error (exit 1) and sends nothing", async () => {
    const code = await runWebhookCreate({
      url: "https://example.com",
      headers: ["NoColon"],
      json: true,
    });
    assert.equal(code, 1);
    assert.equal(JSON.parse(logged[0]).code, "bad_request");
    assert.deepEqual(requests, []);
  });

  it("an API failure prints the error and exits non-zero", async () => {
    const code = await runWebhookGet({ id: "missing", json: false });
    assert.notEqual(code, 0);
    assert.match(errored.join("\n"), /Not found/);
  });
});
