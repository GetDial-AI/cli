import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { setTyping } from "../../lib/ops/typing.ts";

const inputSchema = {
  toNumber: z.string().min(7).describe("Recipient phone number, E.164 (e.g. +14155550123)"),
  fromNumber: z
    .string()
    .min(1)
    .describe(
      "Number the indicator appears from: a phone number id, one of your numbers in E.164, or a nickname",
    ),
};

export const startTypingTool: ToolModule = {
  name: "start_typing",
  config: {
    title: "Start typing indicator",
    description:
      "Show a typing indicator to the recipient, as if someone were composing a message from your number. " +
      "iMessage numbers display it; standard (SMS) numbers have no typing concept and silently ignore it, " +
      "so this is safe to call unconditionally before a send. Fire-and-forget and free. " +
      "Delivering a message or reaction clears the indicator natively on the recipient's device — " +
      "call start_typing again after a send to keep composing, and stop_typing when you stop without sending.",
    inputSchema,
    outputSchema: { ok: z.boolean() },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await setTyping({
        toNumber: args.toNumber as string,
        fromNumber: args.fromNumber as string,
        value: true,
      }),
    ),
};
