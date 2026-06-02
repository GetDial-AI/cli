import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { listenInstall } from "../../lib/ops/listen.ts";

export const listenInstallTool: ToolModule = {
  name: "listen_install",
  config: {
    title: "Install Listen Daemon",
    description:
      "Install the background event daemon (launchd on macOS, systemd --user on Linux) so inbound " +
      "SMS and call-ended events are delivered to this machine in real time.",
    inputSchema: {},
    outputSchema: {
      changed: z.boolean().describe("False if the daemon was already installed"),
      warnings: z.array(z.string()),
      unitPath: z.string().describe("Path to the installed launchd/systemd unit"),
    },
    annotations: {},
  },
  run: async () => jsonResult(listenInstall()),
};
