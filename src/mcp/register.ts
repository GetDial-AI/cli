import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";
import { tools } from "./tools/index.ts";
import { errorResult, type ToolResult } from "./result.ts";
import { isDialError } from "../lib/ops/errors.ts";
import { logger } from "../lib/log.ts";

/**
 * Register every tool onto the MCP server. DialError/ZodError surface their message to
 * the model as a tool error; unexpected errors are logged (to stderr — safe for stdio)
 * and surfaced generically.
 */
export function registerTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(tool.name, tool.config, async (args: Record<string, unknown>): Promise<ToolResult> => {
      try {
        return await tool.run(args ?? {});
      } catch (err) {
        if (isDialError(err)) return errorResult(err.message);
        if (err instanceof ZodError) return errorResult(`Invalid input: ${err.message}`);
        logger.error({ err, tool: tool.name }, "mcp tool error");
        return errorResult("Internal error running tool.");
      }
    });
  }
}
