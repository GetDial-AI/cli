import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listMessages } from "../../lib/ops/messages.ts";
import { messageSchema } from "../schemas.ts";

const inputSchema = {
  numberId: z.string().optional().describe("Filter to a single phone number id"),
  groupId: z
    .string()
    .optional()
    .describe(
      "Filter to one group conversation (see list_groups). Combines with the other filters",
    ),
  direction: z.enum(["inbound", "outbound"]).optional().describe("Filter by direction"),
  since: z.string().optional().describe("Only messages created after this ISO-8601 timestamp"),
};

export const listMessagesTool: ToolModule = {
  name: "list_messages",
  config: {
    title: "List Messages",
    description:
      "List recent messages on your account, newest first. Pass groupId to read one group " +
      "conversation. On a group message `to` is null and the destination is groupId; which of your " +
      "numbers the conversation is on is phoneNumberId.",
    inputSchema,
    outputSchema: { messages: z.array(messageSchema) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      messages: await listMessages({
        numberId: args.numberId as string | undefined,
        groupId: args.groupId as string | undefined,
        direction: args.direction as string | undefined,
        since: args.since as string | undefined,
      }),
    }),
};
