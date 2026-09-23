import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { setTyping } from "../../lib/ops/typing.ts";

const inputSchema = {
  toNumber: z
    .string()
    .min(7)
    .optional()
    .describe(
      "Recipient phone number, E.164 (e.g. +14155550123). Provide exactly one of toNumber or groupId",
    ),
  groupId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "A group conversation to show it in instead (see list_groups). The line comes from the group. Provide exactly one of toNumber or groupId",
    ),
  fromNumber: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Number the indicator appears from: a phone number id, one of your numbers in E.164, or a nickname. Required with toNumber; optional with groupId, which already names its line",
    ),
  channel: z
    .enum(["imessage", "whatsapp"])
    .optional()
    .describe(
      "Which channel to show it on, for a line that carries more than one. Omit to use the number's own default, and omit it with groupId — the group already names its channel",
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
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await setTyping({
        toNumber: args.toNumber as string | undefined,
        groupId: args.groupId as string | undefined,
        fromNumber: args.fromNumber as string | undefined,
        channel: args.channel as "imessage" | "whatsapp" | undefined,
        value: false,
      }),
    ),
};
