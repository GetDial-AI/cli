import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { placeCall } from "../../lib/ops/calls.ts";
import { callSchema } from "../schemas.ts";

const inputSchema = {
  to: z.string().min(7).describe("Destination phone number, E.164 (e.g. +14155550123)"),
  outboundInstruction: z.string().min(1).describe("System prompt for the AI voice agent on this call"),
  language: z.string().optional().describe("BCP-47 language tag for the call. Omit to auto-detect from the destination number's country (alongside en-US)."),
  voiceGender: z.enum(["male", "female"]).optional().describe("Voice gender for the agent; the default is female"),
  transferTo: z.string().optional().describe("Forward-to number, E.164: the agent waits for a real human (riding out hold/IVR) then cold-transfers the call here. Must differ from `to` and the from number."),
  idempotencyKey: z.string().optional().describe("Unique key (e.g. a UUID) making the placement idempotent: retrying with the same key returns the already-placed call instead of dialing again"),
  fromNumber: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Number to call from: a phone number id, one of your numbers in E.164, or a nickname. Exclusive with fromNumberId; omit both to use your primary number",
    ),
  fromNumberId: z.string().optional().describe("Number id to call from; defaults to your primary number"),
  maxCallDurationSeconds: z.number().int().positive().optional().describe("Maximum call duration cap (seconds); the call is terminated when this limit is reached"),
};

export const placeCallTool: ToolModule = {
  name: "place_call",
  config: {
    title: "Place AI Voice Call",
    description:
      "Place an outbound voice call handled by an AI agent. The call runs asynchronously — " +
      "use wait_for_event to block until it ends, then get_call for the transcript.",
    inputSchema,
    outputSchema: { call: callSchema, hint: z.string().describe("Next-step guidance for tracking the call") },
    annotations: { openWorldHint: true },
  },
  run: async (args) => {
    const call = await placeCall({
      to: args.to as string,
      outboundInstruction: args.outboundInstruction as string,
      language: args.language as string | undefined,
      voiceGender: args.voiceGender as string | undefined,
      transferTo: args.transferTo as string | undefined,
      idempotencyKey: args.idempotencyKey as string | undefined,
      fromNumber: args.fromNumber as string | undefined,
      fromNumberId: args.fromNumberId as string | undefined,
      maxCallDurationSeconds: args.maxCallDurationSeconds as number | undefined,
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
