/** MCP tool result content: a JSON text block + structured mirror, optionally an error. */
export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/**
 * JSON tool response. Rendered as text, and mirrored into `structuredContent` (the
 * JSON-coerced form) for clients that validate against the tool's `outputSchema`.
 */
export function jsonResult(data: unknown): ToolResult {
  const text = JSON.stringify(data, null, 2);
  const structured = JSON.parse(text) as unknown;
  const result: ToolResult = { content: [{ type: "text", text }] };
  if (structured !== null && typeof structured === "object" && !Array.isArray(structured)) {
    result.structuredContent = structured as Record<string, unknown>;
  }
  return result;
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
