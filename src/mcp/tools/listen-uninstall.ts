import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listenUninstall } from "../../lib/ops/listen.ts";

export const listenUninstallTool: ToolModule = {
  name: "listen_uninstall",
  config: {
    title: "Uninstall Listen Daemon",
    description: "Stop and remove the background event daemon from this machine.",
    inputSchema: {},
    outputSchema: { ok: z.boolean() },
    annotations: { destructiveHint: true },
  },
  run: async () => jsonResult(listenUninstall()),
};
