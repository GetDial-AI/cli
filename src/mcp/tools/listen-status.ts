import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listenStatus } from "../../lib/ops/listen.ts";

export const listenStatusTool: ToolModule = {
  name: "listen_status",
  config: {
    title: "Listen Daemon Status",
    description: "Report the background event daemon's state (installed/running/pid) and the last few events.",
    inputSchema: {},
    outputSchema: {
      installed: z.boolean(),
      running: z.boolean(),
      pid: z.number().nullable(),
      unitPath: z.string(),
      lastEventAt: z.string().nullable(),
      lastEvents: z.array(z.unknown()).describe("Up to the last 5 events from the local log"),
    },
    annotations: { readOnlyHint: true },
  },
  run: async () => jsonResult(listenStatus()),
};
