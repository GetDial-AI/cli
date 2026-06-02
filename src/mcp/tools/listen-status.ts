import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listenStatus } from "../../lib/ops/listen.ts";

export const listenStatusTool: ToolModule = {
  name: "listen_status",
  config: {
    title: "Listen Daemon Status",
    description: "Report the background event daemon's state (installed/running/pid) and the last few events.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  run: async () => jsonResult(listenStatus()),
};
