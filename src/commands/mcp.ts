import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "../mcp/server.ts";

/**
 * Run the local stdio MCP server. JSON-RPC travels over stdout; the pino logger is
 * already pinned to stderr (see lib/log.ts), and ops/tools never write to stdout, so
 * the protocol stream stays clean. Stays alive until the client disconnects / stdin closes.
 */
export async function runMcp(): Promise<number> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    process.stdin.on("close", resolve);
  });
  return 0;
}
