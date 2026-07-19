import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { tools } from "./tools/index.ts";
import { sendMessageTool } from "./tools/send-message.ts";
import { replyToMessageTool } from "./tools/reply-to-message.ts";
import { placeCallTool } from "./tools/place-call.ts";
import { startTypingTool } from "./tools/start-typing.ts";
import { stopTypingTool } from "./tools/stop-typing.ts";

// One tool per non-excluded `dial` command (`dial listen` worker + `dial mcp` itself excluded).
const EXPECTED = [
  "list_numbers",
  "purchase_number",
  "set_number_properties",
  "send_message",
  "reply_to_message",
  "start_typing",
  "stop_typing",
  "list_messages",
  "place_call",
  "list_calls",
  "get_call",
  "get_account_status",
  "sign_up",
  "onboard",
  "wait_for_event",
  "add_url_target",
  "add_command_target",
  "remove_local_target",
  "list_local_targets",
  "listen_install",
  "listen_uninstall",
  "listen_status",
];

// The remote MCP server's tool set (frontend/src/lib/mcp/tools/). The local server must be
// a strict superset. Hardcoded because the repos can't import one another.
const REMOTE = [
  "send_message",
  "reply_to_message",
  "start_typing",
  "stop_typing",
  "list_messages",
  "place_call",
  "list_calls",
  "get_call",
  "list_numbers",
  "purchase_number",
  "set_number_properties",
  "wait_for_event",
  "get_account_status",
];

describe("mcp tools", () => {
  it("registers exactly the expected 22 tools with unique names", () => {
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, "tool names must be unique");
    assert.deepEqual([...names].sort(), [...EXPECTED].sort());
  });

  it("is a superset of the remote MCP tool names", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const r of REMOTE) assert.ok(names.has(r), `missing remote tool: ${r}`);
  });

  it("send_message accepts media-only sends, mediaUrls, and a forceAudioFile boolean", () => {
    const schema = z.object(sendMessageTool.config.inputSchema as z.ZodRawShape);
    assert.equal(
      schema.safeParse({ to: "+14155550123", mediaUrls: ["https://cdn.example.com/a.m4a"] })
        .success,
      true,
    );
    assert.equal(
      schema.safeParse({ to: "+14155550123", body: "hi", forceAudioFile: true }).success,
      true,
    );
    assert.equal(
      schema.safeParse({ to: "+14155550123", body: "hi", forceAudioFile: "true" }).success,
      false,
    );
  });

  it("typing tools require toNumber and fromNumber, and reject a value field", () => {
    for (const tool of [startTypingTool, stopTypingTool]) {
      const schema = z.object(tool.config.inputSchema as z.ZodRawShape).strict();
      assert.equal(
        schema.safeParse({ toNumber: "+14155550123", fromNumber: "Support line" }).success,
        true,
      );
      assert.equal(
        schema.safeParse({ toNumber: "+14155550123" }).success,
        false,
        `${tool.name}: fromNumber required`,
      );
      assert.equal(
        schema.safeParse({ fromNumber: "pn_1" }).success,
        false,
        `${tool.name}: toNumber required`,
      );
      assert.equal(
        schema.safeParse({ toNumber: "+14155550123", fromNumber: "pn_1", value: true }).success,
        false,
      );
    }
  });

  it("send_message and place_call accept the flexible fromNumber selector", () => {
    const send = z.object(sendMessageTool.config.inputSchema as z.ZodRawShape);
    assert.equal(
      send.safeParse({ to: "+14155550123", body: "hi", fromNumber: "Support line" }).success,
      true,
    );
    const call = z.object(placeCallTool.config.inputSchema as z.ZodRawShape);
    assert.equal(
      call.safeParse({ to: "+14155550123", outboundInstruction: "x", fromNumber: "Support line" })
        .success,
      true,
    );
  });

  it("reply_to_message takes a messageId plus optional body/reaction strings", () => {
    const schema = z.object(replyToMessageTool.config.inputSchema as z.ZodRawShape);
    assert.equal(schema.safeParse({ messageId: "msg_1", body: "on my way" }).success, true);
    assert.equal(schema.safeParse({ messageId: "msg_1", reaction: "🔥" }).success, true);
    assert.equal(schema.safeParse({ body: "no target" }).success, false);
    assert.equal(schema.safeParse({ messageId: "msg_1", reaction: 7 }).success, false);
  });

  it("serves tools/list over stdio with only JSON-RPC on stdout", async () => {
    const cliPath = fileURLToPath(new URL("../cli.ts", import.meta.url));
    const home = mkdtempSync(join(tmpdir(), "dial-mcp-smoke-"));
    const child = spawn(process.execPath, ["--import", "tsx", cliPath, "mcp"], {
      env: { ...process.env, HOME: home },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stdin.write(
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n',
    );
    child.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    child.stdin.end();
    await new Promise<void>((resolve) => child.on("close", () => resolve()));

    const lines = out.split("\n").filter(Boolean);
    // Every stdout line must be valid JSON-RPC — no stray logging on stdout.
    const parsed = lines.map((l) => JSON.parse(l));
    const listResp = parsed.find((m) => m.id === 2);
    assert.ok(listResp, "no tools/list response on stdout");
    assert.equal(listResp.result.tools.length, 22);
  });
});
