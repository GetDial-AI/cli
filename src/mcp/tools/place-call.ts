import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { placeCall } from "../../lib/ops/calls.ts";

const inputSchema = {
  to: z.string().min(7).describe("Destination phone number, E.164 (e.g. +14155550123)"),
  outboundInstruction: z.string().min(1).describe("System prompt for the AI voice agent on this call"),
  language: z.string().default("en-US").describe("BCP-47 language tag for the call"),
  fromNumberId: z.string().optional().describe("Number id to call from; defaults to your primary number"),
};

export const placeCallTool: ToolModule = {
  name: "place_call",
  config: {
    title: "Place AI Voice Call",
    description:
      "Place an outbound voice call handled by an AI agent. The call runs asynchronously — " +
      "use wait_for_event to block until it ends, then get_call for the transcript.",
    inputSchema,
    annotations: { openWorldHint: true },
  },
  run: async (args) => {
    const call = await placeCall({
      to: args.to as string,
      outboundInstruction: args.outboundInstruction as string,
      language: (args.language as string) ?? "en-US",
      fromNumberId: args.fromNumberId as string | undefined,
    });
    return jsonResult({
      call,
      hint:
        `The call is now in progress. To be notified when it ends, call wait_for_event with ` +
        `eventType "call.ended" and field "callId=${call.id}". Then call get_call with callId ` +
        `"${call.id}" for the final status, duration, and transcript.`,
    });
  },
};
