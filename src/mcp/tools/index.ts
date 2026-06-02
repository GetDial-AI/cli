import type { ToolModule } from "../tool.ts";
import { listNumbersTool } from "./list-numbers.ts";
import { purchaseNumberTool } from "./purchase-number.ts";
import { setNumberPropertiesTool } from "./set-number-properties.ts";
import { sendMessageTool } from "./send-message.ts";
import { listMessagesTool } from "./list-messages.ts";

/** Every tool registered on the local stdio MCP server. */
export const tools: ToolModule[] = [
  listNumbersTool,
  purchaseNumberTool,
  setNumberPropertiesTool,
  sendMessageTool,
  listMessagesTool,
];
