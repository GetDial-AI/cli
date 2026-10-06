import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CHANNELS } from "./message/send.ts";
import { TYPING_CHANNELS, invalidChannel } from "./typing/start.ts";
import { sendMessageTool } from "../mcp/tools/send-message.ts";
import { startTypingTool } from "../mcp/tools/start-typing.ts";
import { stopTypingTool } from "../mcp/tools/stop-typing.ts";

// `channel` names the SMS rail as well as iMessage and WhatsApp (dial-docs: Send a message,
// Set a typing indicator). The CLI checks the value locally, and the local MCP server mirrors
// the hosted one's enum, so all three places must accept exactly the same words.

describe("channel sms", () => {
  it("is accepted by dial message and dial typing", () => {
    assert.deepEqual([...CHANNELS], ["sms", "imessage", "whatsapp"]);
    assert.deepEqual([...TYPING_CHANNELS], ["sms", "imessage", "whatsapp"]);
    assert.equal(invalidChannel("sms"), false);
    assert.equal(invalidChannel("rcs"), true);
  });

  it("is accepted by the local MCP send and typing tools, like the hosted ones", () => {
    const send = z.object(sendMessageTool.config.inputSchema as z.ZodRawShape);
    assert.equal(send.safeParse({ to: "+14155550123", body: "hi", channel: "sms" }).success, true);
    assert.equal(send.safeParse({ to: "+14155550123", body: "hi", channel: "rcs" }).success, false);
    for (const tool of [startTypingTool, stopTypingTool]) {
      const schema = z.object(tool.config.inputSchema as z.ZodRawShape);
      assert.equal(
        schema.safeParse({ toNumber: "+14155550123", fromNumber: "pn_1", channel: "sms" }).success,
        true,
        `${tool.name} should accept channel sms`,
      );
    }
  });
});
