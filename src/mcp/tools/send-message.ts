import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { sendMessage, MAX_MEDIA_ITEMS } from "../../lib/ops/messages.ts";
import { messageSchema } from "../schemas.ts";

const inputSchema = {
  to: z.string().min(7).describe("Destination phone number, E.164 (e.g. +14155550123)"),
  body: z.string().optional().describe("Message body; optional when mediaUrls is given (media-only send)"),
  fromNumber: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Number to send from: a phone number id, one of your numbers in E.164, or a nickname. Exclusive with fromNumberId; omit both to use your primary number",
    ),
  fromNumberId: z.string().optional().describe("Number id to send from; defaults to your primary number"),
  mediaUrls: z
    .array(z.string().url())
    .max(MAX_MEDIA_ITEMS)
    .optional()
    .describe("Publicly reachable http(s) URLs of media to attach (MMS); Dial mirrors and re-hosts them"),
  forceAudioFile: z
    .boolean()
    .optional()
    .describe(
      "Send an audio attachment as a regular file attachment instead of an iMessage voice message. No effect on standard numbers or non-audio media.",
    ),
};

export const sendMessageTool: ToolModule = {
  name: "send_message",
  config: {
    title: "Send message",
    description:
      "Send a message from one of your Dial numbers, optionally with media attachments (MMS). On an iMessage number, a single audio attachment is delivered as a voice message unless forceAudioFile is true.",
    inputSchema,
    outputSchema: { message: messageSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      message: await sendMessage({
        to: args.to as string,
        body: args.body as string | undefined,
        fromNumber: args.fromNumber as string | undefined,
        fromNumberId: args.fromNumberId as string | undefined,
        media: args.mediaUrls as string[] | undefined,
        forceAudioFile: args.forceAudioFile as boolean | undefined,
      }),
    }),
};
