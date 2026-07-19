import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { addCommandTarget } from "../../lib/ops/local-targets.ts";

const inputSchema = {
  path: z
    .string()
    .min(1)
    .describe("Absolute path to an executable the daemon spawns once per event"),
  args: z
    .array(z.string())
    .optional()
    .describe("Extra args; the event JSON is appended as the final positional arg"),
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Per-attempt timeout (default 5)"),
};

export const addCommandTargetTool: ToolModule = {
  name: "add_command_target",
  config: {
    title: "Add Command Fan-out Target",
    description:
      "Register an executable the local listen daemon runs once per event (event JSON as the final arg).",
    inputSchema,
    outputSchema: {
      added: z.boolean().describe("False if the target was already registered"),
      path: z.string(),
      args: z.array(z.string()),
    },
    annotations: { openWorldHint: false },
  },
  run: async (args) =>
    jsonResult(
      addCommandTarget({
        path: args.path as string,
        args: args.args as string[] | undefined,
        timeoutSeconds: args.timeoutSeconds as number | undefined,
      }),
    ),
};
