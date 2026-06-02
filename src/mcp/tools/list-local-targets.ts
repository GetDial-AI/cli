import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listLocalTargets } from "../../lib/ops/local-targets.ts";

export const listLocalTargetsTool: ToolModule = {
  name: "list_local_targets",
  config: {
    title: "List Fan-out Targets",
    description: "List the local fan-out targets the listen daemon currently delivers events to.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  run: async () => jsonResult(listLocalTargets()),
};
