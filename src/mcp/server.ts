import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../lib/version.ts";
import { registerTools } from "./register.ts";

// Server identity shown by MCP clients. Mirrors the remote Dial MCP server: name/title +
// the scalable Dial favicon (served same-origin, https). SVG with sizes:["any"] covers
// every render size.
const SERVER_INFO = {
  name: "dial",
  title: "Dial",
  version: VERSION,
  websiteUrl: "https://getdial.ai",
  icons: [{ src: "https://getdial.ai/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
};

export function buildServer(): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerTools(server);
  return server;
}
