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
  channel: z
    .enum(["imessage", "whatsapp"])
    .optional()
    .describe(
      "Which channel to clear it on, for a line that carries more than one. Omit to use the number's own default. Pass the same channel start_typing was given",
    ),
};

export const stopTypingTool: ToolModule = {
  name: "stop_typing",
  config: {
    title: "Stop typing indicator",
    description:
      "Clear a typing indicator previously shown with start_typing. Delivering a message or reaction " +
      "already clears it natively on the recipient's device — call this when you stop composing " +
      "without sending. Standard (SMS) numbers silently ignore it.",
    inputSchema,
    outputSchema: { ok: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await setTyping({
        toNumber: args.toNumber as string,
        fromNumber: args.fromNumber as string,
        channel: args.channel as "imessage" | "whatsapp" | undefined,
        value: false,
      }),
    ),
};
