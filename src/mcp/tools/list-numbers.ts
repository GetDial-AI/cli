import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listNumbers } from "../../lib/ops/numbers.ts";
import { phoneNumberSchema } from "../schemas.ts";

export const listNumbersTool: ToolModule = {
  name: "list_numbers",
  config: {
    title: "List Phone Numbers",
    description: "List the phone numbers on your Dial account, with the default number id.",
    inputSchema: {},
    outputSchema: {
      numbers: z.array(phoneNumberSchema),
      defaultNumberId: z.string().nullable().describe("Your primary number id, or null"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async () => jsonResult(await listNumbers()),
};
