import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listNumbers } from "../../lib/ops/numbers.ts";

export const listNumbersTool: ToolModule = {
  name: "list_numbers",
  config: {
    title: "List Phone Numbers",
    description: "List the phone numbers on your Dial account, with the default number id.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async () => jsonResult(await listNumbers()),
};
