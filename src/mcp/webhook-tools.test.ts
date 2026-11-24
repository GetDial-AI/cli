import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tools } from "./tools/index.ts";
import { OPERATIONAL_TOOL_NAMES } from "./tools/tool-names.ts";
import { webhookSchema } from "./schemas.ts";
import type { ToolModule } from "./tool.ts";
import { writeAuth } from "../lib/state.ts";
import { startMockApi, type MockRoute } from "../test-utils.ts";

// The Local MCP's webhook tools: the same seven names, in the same order, as the hosted
// server's twin list, each a thin call to the webhook ops.

const WEBHOOK_TOOLS = [
  "list_webhooks",
  "get_webhook",
  "create_webhook",
  "update_webhook",
  "delete_webhook",
  "ping_webhook",
  "get_webhook_secret",
];

const READ_ONLY = new Set(["list_webhooks", "get_webhook", "get_webhook_secret"]);
const DESTRUCTIVE = new Set(["update_webhook", "delete_webhook"]);
const IDEMPOTENT = new Set([
  "list_webhooks",
  "get_webhook",
  "update_webhook",
  "delete_webhook",
  "get_webhook_secret",
]);

const WEBHOOK = {
  id: "wh_1",
  targetUrl: "https://example.com/hooks/dial",
  eventTypes: ["*"],
  phoneNumberIds: null,
  secretMasked: "whsec_••••ab12",
  headers: {},
  queryParams: {},
  lastPingSucceededAt: null,
  createdAt: "2026-11-20T00:00:00.000Z",
};

let tmp: string;
let api: { url: string; close: () => Promise<void> } | undefined;

function tool(name: string): ToolModule {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `${name} not registered`);
  return found;
}

async function serve(route: MockRoute): Promise<void> {
  api = await startMockApi(route);
  process.env.DIAL_API_URL = api.url;
}

describe("local MCP webhook tools", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-mcp-webhooks-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
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
    api = undefined;
    delete process.env.DIAL_API_URL;
  });

  it("carries the seven webhook tools, right after the policy tools as on the hosted server", () => {
    const at = OPERATIONAL_TOOL_NAMES.indexOf("remove_policy_entries");
    assert.deepEqual(OPERATIONAL_TOOL_NAMES.slice(at + 1, at + 8), WEBHOOK_TOOLS);
    for (const name of WEBHOOK_TOOLS) tool(name);
  });

  it("annotates each tool as the hosted server does", () => {
    for (const name of WEBHOOK_TOOLS) {
      const a = tool(name).config.annotations ?? {};
      assert.equal(!!a.readOnlyHint, READ_ONLY.has(name), `${name} readOnlyHint`);
      assert.equal(!!a.destructiveHint, DESTRUCTIVE.has(name), `${name} destructiveHint`);
      assert.equal(!!a.idempotentHint, IDEMPOTENT.has(name), `${name} idempotentHint`);
      assert.equal(a.openWorldHint, true, `${name} openWorldHint`);
    }
  });

  it("takes the id as webhookId on every per-webhook tool", () => {
    for (const name of WEBHOOK_TOOLS.filter(
      (n) => !["list_webhooks", "create_webhook"].includes(n),
    ))
      assert.ok("webhookId" in tool(name).config.inputSchema, `${name} lacks webhookId`);
  });

  it("the webhook output schema accepts a webhook as the API returns it", () => {
    assert.equal(webhookSchema.safeParse(WEBHOOK).success, true);
  });

  it("create_webhook posts the body as given and returns the webhook", async () => {
    let body: unknown;
    await serve((m, u, b) => {
      if (m === "POST" && u === "/api/v1/webhooks") {
        body = JSON.parse(b);
        return { status: 201, json: { webhook: WEBHOOK } };
      }
      return undefined;
    });
    const input = {
      targetUrl: "https://example.com/hooks/dial",
      eventTypes: ["message.received"],
      phoneNumberIds: ["pn_1"],
      headers: { Authorization: "Bearer abc" },
      queryParams: { token: "t" },
    };
    const out = await tool("create_webhook").run(input);
    assert.deepEqual(body, input);
    assert.deepEqual(out.structuredContent, { webhook: WEBHOOK });
  });

  it("update_webhook patches the fields but not the id, keeping null to clear", async () => {
    let seen: { url: string; body: unknown } | undefined;
    await serve((m, u, b) => {
      if (m === "PATCH") {
        seen = { url: u, body: JSON.parse(b) };
        return { status: 200, json: { webhook: WEBHOOK } };
      }
      return undefined;
    });
    await tool("update_webhook").run({ webhookId: "wh_1", headers: null, phoneNumberIds: null });
    assert.deepEqual(seen, {
      url: "/api/v1/webhooks/wh_1",
      body: { headers: null, phoneNumberIds: null },
    });
  });

  it("delete_webhook reports what it deleted", async () => {
    await serve((m, u) =>
      m === "DELETE" && u === "/api/v1/webhooks/wh_1" ? { status: 204, json: null } : undefined,
    );
    const out = await tool("delete_webhook").run({ webhookId: "wh_1" });
    assert.deepEqual(out.structuredContent, { deleted: true, webhookId: "wh_1" });
  });

  it("ping_webhook returns the eventId and get_webhook_secret the secret", async () => {
    await serve((m, u) => {
      if (m === "POST" && u === "/api/v1/webhooks/wh_1/ping")
        return { status: 202, json: { eventId: "evt_1" } };
      if (m === "GET" && u === "/api/v1/webhooks/wh_1/secret")
        return { status: 200, json: { secret: "whsec_full" } };
      return undefined;
    });
    const ping = await tool("ping_webhook").run({ webhookId: "wh_1" });
    const secret = await tool("get_webhook_secret").run({ webhookId: "wh_1" });
    assert.deepEqual(ping.structuredContent, { eventId: "evt_1" });
    assert.deepEqual(secret.structuredContent, { secret: "whsec_full" });
  });

  it("list_webhooks and get_webhook return the webhooks with their dashboard links", async () => {
    await serve((m, u) => {
      if (m === "GET" && u === "/api/v1/webhooks")
        return { status: 200, json: { webhooks: [WEBHOOK] } };
      if (m === "GET" && u === "/api/v1/webhooks/wh_1")
        return { status: 200, json: { webhook: WEBHOOK } };
      return undefined;
    });
    const list = await tool("list_webhooks").run({});
    const one = await tool("get_webhook").run({ webhookId: "wh_1" });
    const listed = list.structuredContent as { webhooks: unknown; hint: string };
    const got = one.structuredContent as { webhook: unknown; hint: string };
    assert.deepEqual(listed.webhooks, [WEBHOOK]);
    assert.deepEqual(got.webhook, WEBHOOK);
    // The mock API is the base, so the dashboard is served from it too.
    assert.ok(listed.hint.includes(`${api?.url}/dashboard/webhooks?new=1`), listed.hint);
    assert.ok(listed.hint.includes(`${api?.url}/dashboard/webhooks?edit=wh_1`), listed.hint);
    assert.ok(got.hint.includes(`${api?.url}/dashboard/webhooks?edit=wh_1`), got.hint);
  });
});
