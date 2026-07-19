import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { setNumberProperties } from "../../lib/ops/numbers.ts";
import { phoneNumberSchema } from "../schemas.ts";

const inputSchema = {
  number: z.string().min(7).describe("The E.164 phone number to update (e.g. +14155550123)"),
  inboundInstruction: z
    .string()
    .min(1)
    .optional()
    .describe("New system prompt for inbound calls to this number"),
  inboundVoiceGender: z
    .enum(["male", "female"])
    .optional()
    .describe("Voice gender for inbound calls to this number; the default is female"),
  inboundLanguage: z
    .string()
    .optional()
    .describe(
      "BCP-47 language tag pinning inbound calls to this number to one language (e.g. es-ES). Pass an empty string to clear it (reverts to detecting the language from the caller's country prefix per call).",
    ),
  nickname: z
    .string()
    .max(100)
    .optional()
    .describe(
      'Human-readable label for the number, e.g. "Support line". Pass an empty string to clear it.',
    ),
  maxCallDurationSeconds: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe(
      "Call duration cap for this number, in seconds, applied as a hard ceiling to both inbound and outbound calls (the smallest of the per-number, account, and per-call caps wins). Pass null to clear the cap; omit to leave it unchanged.",
    ),
};

export const setNumberPropertiesTool: ToolModule = {
  name: "set_number_properties",
  config: {
    title: "Set Number Properties",
    description:
      "Update a phone number's properties: its inbound instruction (the system prompt for inbound calls), inbound voice gender, inbound language, and/or its nickname. Provide at least one.",
    inputSchema,
    outputSchema: { number: phoneNumberSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      number: await setNumberProperties({
        number: args.number as string,
        inboundInstruction: args.inboundInstruction as string | undefined,
        ...(args.inboundVoiceGender !== undefined
          ? { inboundVoiceGender: args.inboundVoiceGender as string }
          : {}),
        ...(args.inboundLanguage !== undefined
          ? { inboundLanguage: args.inboundLanguage as string }
          : {}),
        ...(args.nickname !== undefined ? { nickname: args.nickname as string } : {}),
        ...(args.maxCallDurationSeconds !== undefined
          ? { maxCallDurationSeconds: args.maxCallDurationSeconds as number | null }
          : {}),
      }),
    }),
};
