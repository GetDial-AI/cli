import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { removeLocalTarget } from "../../lib/ops/local-targets.ts";

const inputSchema = {
  id: z.string().min(1).describe("Target id: the URL for url targets, the path for cmd targets"),
};

export const removeLocalTargetTool: ToolModule = {
  name: "remove_local_target",
  config: {
    title: "Remove Fan-out Target",
    description:
      "Unregister a local fan-out target by id. Returns removed:false if no such target.",
    inputSchema,
    outputSchema: {
      removed: z.boolean().describe("False if no target matched the id"),
      id: z.string(),
    },
    annotations: { destructiveHint: true },
  },
  run: async (args) => jsonResult(removeLocalTarget(args.id as string)),
};
