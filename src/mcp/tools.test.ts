import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { tools } from "./tools/index.ts";
import { OPERATIONAL_TOOL_NAMES, LOCAL_ONLY_TOOL_NAMES } from "./tools/tool-names.ts";
import { sendMessageTool } from "./tools/send-message.ts";
import { replyToMessageTool } from "./tools/reply-to-message.ts";
import { placeCallTool } from "./tools/place-call.ts";
import { startTypingTool } from "./tools/start-typing.ts";
import { stopTypingTool } from "./tools/stop-typing.ts";
import { authVerifyOtpTool } from "./tools/auth-verify-otp.ts";

// One tool per non-excluded `dial` command (`dial listen` worker + `dial mcp` itself
// excluded). Both halves come from tools/tool-names.ts rather than a copy living here:
// OPERATIONAL_TOOL_NAMES is the list the hosted server's twin file must match exactly,
// and a list only this test could see would let the two servers drift apart while each
// file still read correctly on its own.
const EXPECTED = [...OPERATIONAL_TOOL_NAMES, ...LOCAL_ONLY_TOOL_NAMES];

// The remote MCP server's tool set (frontend/src/lib/mcp/tools/). The local server must be
// a strict superset. Duplicated as a committed list because the repos can't import one
// another — if the two files disagree, the fix is the server missing a tool.
const REMOTE = OPERATIONAL_TOOL_NAMES;

describe("mcp tools", () => {
  it("registers exactly the expected tools with unique names", () => {
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, "tool names must be unique");
    assert.deepEqual([...names].sort(), [...EXPECTED].sort());
  });

  it("is a superset of the remote MCP tool names", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const r of REMOTE) assert.ok(names.has(r), `missing remote tool: ${r}`);
  });

  it("exposes list_groups, which both servers must carry", () => {
    // Named explicitly rather than left to the list comparison above: this is the tool
    // the groups work adds, and a rename would otherwise only show as a count mismatch.
    assert.ok(
      tools.some((t) => t.name === "list_groups"),
      "list_groups must be registered on the local server too",
    );
  });

  it("auth_verify_otp declares dashboardUrl and email in its output schema", () => {
    // The account path spreads OnboardResult, so both fields already flow
    // through — but a field absent from the schema is invisible to the model
    // reading it, which is the whole point of returning them.
    const schema = authVerifyOtpTool.config.outputSchema as z.ZodRawShape;
    assert.ok("dashboardUrl" in schema, "dashboardUrl must be declared");
    assert.ok("email" in schema, "email must be declared");
  });

  it("the auth tools mirror the CLI verbs one-to-one", () => {
    // A derived surface must not drift from the verbs it wraps: every `dial auth
    // <verb>` has exactly one tool, and no stale pre-phone-verification name
    // survives.
    const names = new Set(tools.map((t) => t.name));
    for (const expected of ["auth_login", "auth_register_number", "auth_verify_otp"]) {
      assert.ok(names.has(expected), `missing auth tool: ${expected}`);
    }
    assert.ok(!names.has("sign_up"), "sign_up was replaced by auth_login");
    assert.ok(!names.has("onboard"), "onboard was replaced by auth_verify_otp");
  });

  it("auth_verify_otp can verify the SMS code, not just the emailed one", () => {
    const schema = authVerifyOtpTool.config.inputSchema as z.ZodRawShape;
    assert.ok("number" in schema, "the SMS step needs a `number` switch");
    assert.ok("registrationId" in schema, "the SMS step keys off a registration id");
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
    // Counted from the committed lists, not written out: a literal here is a second
    // place to forget when a tool is added, and this assertion is about the stdio
    // transport serving the whole registry — not about how many tools there happen to be.
    assert.equal(listResp.result.tools.length, EXPECTED.length);
  });
});
