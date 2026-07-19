import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { replyToMessage } from "../../lib/ops/messages.ts";
import { messageSchema } from "../schemas.ts";

const inputSchema = {
  messageId: z
    .string()
    .describe(
      "Id of the message to reply or react to (from list_messages or a message.received event)",
    ),
  body: z
    .string()
    .optional()
    .describe("Reply text; on an iMessage number it threads under the target message"),
  reaction: z
    .string()
    .optional()
    .describe(
      "Reaction to send instead of a body: love, like, dislike, laugh, emphasize, question, or a single emoji",
    ),
};

export const replyToMessageTool: ToolModule = {
  name: "reply_to_message",
  config: {
    title: "Reply to a message",
    description:
      "Reply in-thread or react to an existing message. The reply goes out from the Dial number the target message belongs to, to the other party — no from/to needed. Provide exactly one of body or reaction. On iMessage numbers replies thread and reactions are native; recipients that can only receive SMS get an emoji reaction as a regular text, and named reactions are rejected.",
    inputSchema,
    outputSchema: { message: messageSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      message: await replyToMessage({
        messageId: args.messageId as string,
        body: args.body as string | undefined,
        reaction: args.reaction as string | undefined,
      }),
    }),
};
