import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listMessages } from "../../lib/ops/messages.ts";

const inputSchema = {
  numberId: z.string().optional().describe("Filter to a single phone number id"),
  direction: z.enum(["inbound", "outbound"]).optional().describe("Filter by direction"),
  since: z.string().optional().describe("Only messages created after this ISO-8601 timestamp"),
};

export const listMessagesTool: ToolModule = {
  name: "list_messages",
  config: {
    title: "List Messages",
    description: "List recent messages on your account, newest first.",
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await listMessages({
        numberId: args.numberId as string | undefined,
        direction: args.direction as string | undefined,
        since: args.since as string | undefined,
      }),
    ),
};
