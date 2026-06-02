import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { getCall } from "../../lib/ops/calls.ts";
import { callSchema } from "../schemas.ts";

const inputSchema = {
  callId: z.string().min(1).describe("The call id to fetch"),
};

export const getCallTool: ToolModule = {
  name: "get_call",
  config: {
    title: "Get Call",
    description: "Fetch a single call by id — status, duration, and transcript when available.",
    inputSchema,
    outputSchema: { call: callSchema },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) => jsonResult({ call: await getCall(args.callId as string) }),
};
