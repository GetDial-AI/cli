import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { setNumberProperties } from "../../lib/ops/numbers.ts";
import { phoneNumberSchema } from "../schemas.ts";

const inputSchema = {
  number: z.string().min(7).describe("The E.164 phone number to update (e.g. +14155550123)"),
  inboundInstruction: z.string().min(1).optional().describe("New system prompt for inbound calls to this number"),
  inboundVoiceGender: z.enum(["male", "female"]).optional().describe("Voice gender for inbound calls to this number (defaults to the caller's language default voice)"),
  nickname: z.string().max(100).optional().describe('Human-readable label for the number, e.g. "Support line". Pass an empty string to clear it.'),
};

export const setNumberPropertiesTool: ToolModule = {
  name: "set_number_properties",
  config: {
    title: "Set Number Properties",
    description:
      "Update a phone number's properties: its inbound instruction (the system prompt for inbound calls) and/or its nickname. Provide at least one.",
    inputSchema,
    outputSchema: { number: phoneNumberSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      number: await setNumberProperties({
        number: args.number as string,
        inboundInstruction: args.inboundInstruction as string | undefined,
        ...(args.inboundVoiceGender !== undefined ? { inboundVoiceGender: args.inboundVoiceGender as string } : {}),
        ...(args.nickname !== undefined ? { nickname: args.nickname as string } : {}),
      }),
    }),
};
