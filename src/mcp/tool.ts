import type { ZodRawShape } from "zod";
import type { ToolResult } from "./result.ts";

/**
 * An MCP tool: metadata + a Zod input shape + a `run` that delegates to a console-free
 * op (or an existing console-free lib). One file per tool under ./tools.
 */
export interface ToolModule {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: ZodRawShape;
    outputSchema?: ZodRawShape;
    annotations?: {
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
  };
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}
