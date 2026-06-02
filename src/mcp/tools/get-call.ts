import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { getCall } from "../../lib/ops/calls.ts";

const inputSchema = {
  callId: z.string().min(1).describe("The call id to fetch"),
};

export const getCallTool: ToolModule = {
  name: "get_call",
  config: {
    title: "Get Call",
    description: "Fetch a single call by id — status, duration, and transcript when available.",
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async (args) => jsonResult(await getCall(args.callId as string)),
};
