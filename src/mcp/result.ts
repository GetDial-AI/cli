/** MCP tool result content: a single JSON text block, optionally flagged as an error. */
export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
