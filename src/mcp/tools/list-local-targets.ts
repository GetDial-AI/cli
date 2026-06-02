import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listLocalTargets } from "../../lib/ops/local-targets.ts";
import { localTargetSchema } from "../schemas.ts";

export const listLocalTargetsTool: ToolModule = {
  name: "list_local_targets",
  config: {
    title: "List Fan-out Targets",
    description: "List the local fan-out targets the listen daemon currently delivers events to.",
    inputSchema: {},
    outputSchema: { targets: z.array(localTargetSchema) },
    annotations: { readOnlyHint: true },
  },
  run: async () => jsonResult({ targets: listLocalTargets() }),
};
