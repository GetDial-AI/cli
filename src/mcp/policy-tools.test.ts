import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tools } from "./tools/index.ts";
import { OPERATIONAL_TOOL_NAMES } from "./tools/tool-names.ts";
import { phoneNumberSchema, callSchema } from "./schemas.ts";
import { writeAuth } from "../lib/state.ts";
import { startMockApi } from "../test-utils.ts";

// The Local MCP's allow-list tools: the same seven names, in the same order, as the
// hosted server's twin list, each a thin call to the policy ops.

const POLICY_TOOLS = [
  "list_policies",
  "get_policy",
  "create_policy",
  "update_policy",
  "delete_policy",
  "add_policy_entries",
  "remove_policy_entries",
];

let tmp: string;
let api: { url: string; close: () => Promise<void> } | undefined;

describe("local MCP policy tools", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-mcp-policies-"));
    process.env.HOME = tmp;
    delete process.env.XDG_DATA_HOME;
    writeAuth({ apiKey: "sk_live_x", accountId: "a", email: "e", phoneNumber: "+15550001111", phoneNumberId: "pn_1" });
  });
  afterEach(async () => {
    rmSync(tmp, { recursive: true, force: true });
    if (api) await api.close();
    api = undefined;
    delete process.env.DIAL_API_URL;
  });

  it("carries the seven policy tools, after wait_for_event as on the hosted server", () => {
    const at = OPERATIONAL_TOOL_NAMES.indexOf("wait_for_event");
    assert.deepEqual(OPERATIONAL_TOOL_NAMES.slice(at + 1, at + 8), POLICY_TOOLS);
    for (const name of POLICY_TOOLS) assert.ok(tools.find((t) => t.name === name), `${name} not registered`);
  });

  it("number and call outputs carry the allow-list fields", () => {
    assert.ok("inboundCallPolicy" in phoneNumberSchema.shape);
    assert.ok("blockedByPolicyId" in callSchema.shape);
  });

  it("create_policy posts the list and returns it", async () => {
    let body: unknown;
    api = await startMockApi((m, u, b) => {
      if (m === "POST" && u === "/api/v1/policies") {
        body = JSON.parse(b);
        return { status: 201, json: { policy: { id: "pol_1" } } };
      }
      return undefined;
    });
    process.env.DIAL_API_URL = api.url;
    const tool = tools.find((t) => t.name === "create_policy")!;
    const out = await tool.run({ name: "Known", scope: "account", entries: [{ number: "+14155550123" }] });
    assert.deepEqual(body, { name: "Known", scope: "account", entries: [{ number: "+14155550123" }] });
    assert.deepEqual(out.structuredContent, { policy: { id: "pol_1" } });
  });

  it("delete_policy reports what it deleted", async () => {
    api = await startMockApi((m, u) => (m === "DELETE" && u === "/api/v1/policies/pol_1" ? { status: 204, json: null } : undefined));
    process.env.DIAL_API_URL = api.url;
    const out = await tools.find((t) => t.name === "delete_policy")!.run({ policyId: "pol_1" });
    assert.deepEqual(out.structuredContent, { deleted: true, policyId: "pol_1" });
  });
});
