import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { setNumberProperties } from "../../lib/ops/numbers.ts";
import { phoneNumberSchema } from "../schemas.ts";

const inputSchema = {
  number: z.string().min(7).describe("The E.164 phone number to update (e.g. +14155550123)"),
  inboundInstruction: z.string().min(1).describe("New system prompt for inbound calls to this number"),
};

export const setNumberPropertiesTool: ToolModule = {
  name: "set_number_properties",
  config: {
    title: "Set Number Properties",
    description: "Update a phone number's inbound instruction (the system prompt for inbound calls).",
    inputSchema,
    outputSchema: { number: phoneNumberSchema },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      number: await setNumberProperties({
        number: args.number as string,
        inboundInstruction: args.inboundInstruction as string,
      }),
    }),
};
