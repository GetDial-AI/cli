import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { purchaseNumber } from "../../lib/ops/numbers.ts";
import { phoneNumberSchema } from "../schemas.ts";

const inputSchema = {
  inboundInstruction: z.string().min(1).describe("System prompt for inbound calls to this number"),
  country: z.string().optional().describe("ISO-3166-1 alpha-2 country code (defaults to US server-side)"),
  areaCode: z.string().optional().describe("Preferred area code (US/CA)"),
};

export const purchaseNumberTool: ToolModule = {
  name: "purchase_number",
  config: {
    title: "Purchase Phone Number",
    description: "Purchase an additional phone number. This spends money on the account.",
    inputSchema,
    outputSchema: { number: phoneNumberSchema },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  run: async (args) =>
    jsonResult({
      number: await purchaseNumber({
        inboundInstruction: args.inboundInstruction as string,
        country: args.country as string | undefined,
        areaCode: args.areaCode as string | undefined,
      }),
    }),
};
