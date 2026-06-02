import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { sendMessage } from "../../lib/ops/messages.ts";
import { messageSchema } from "../schemas.ts";

const inputSchema = {
  to: z.string().min(7).describe("Destination phone number, E.164 (e.g. +14155550123)"),
  body: z.string().min(1).describe("Message body"),
  fromNumberId: z.string().optional().describe("Number id to send from; defaults to your primary number"),
};

export const sendMessageTool: ToolModule = {
  name: "send_message",
  config: {
    title: "Send SMS",
    description: "Send an SMS from one of your Dial numbers.",
    inputSchema,
    outputSchema: { message: messageSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      message: await sendMessage({
        to: args.to as string,
        body: args.body as string,
        fromNumberId: args.fromNumberId as string | undefined,
      }),
    }),
};
