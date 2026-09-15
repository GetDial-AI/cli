import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listCalls } from "../../lib/ops/calls.ts";
import { callSchema } from "../schemas.ts";

const inputSchema = {
  contact: z
    .string()
    .optional()
    .describe("One conversation: calls exchanged with this number (E.164), both directions, across every line"),
  numberId: z.string().optional().describe("Filter to a single phone number id"),
  direction: z.enum(["inbound", "outbound"]).optional().describe("Filter by direction"),
  since: z.string().optional().describe("Only calls created after this ISO-8601 timestamp"),
};

export const listCallsTool: ToolModule = {
  name: "list_calls",
  config: {
    title: "List Calls",
    description:
      "List recent calls on your account, newest first. Pass `contact` to read one person's call history.",
    inputSchema,
    outputSchema: { calls: z.array(callSchema) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      calls: await listCalls({
        numberId: args.numberId as string | undefined,
        direction: args.direction as string | undefined,
        since: args.since as string | undefined,
        contact: args.contact as string | undefined,
      }),
    }),
};
