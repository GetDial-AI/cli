import type { ToolModule } from "../tool.ts";
import { listNumbersTool } from "./list-numbers.ts";
import { purchaseNumberTool } from "./purchase-number.ts";
import { setNumberPropertiesTool } from "./set-number-properties.ts";
import { sendMessageTool } from "./send-message.ts";
import { replyToMessageTool } from "./reply-to-message.ts";
import { startTypingTool } from "./start-typing.ts";
import { stopTypingTool } from "./stop-typing.ts";
import { listMessagesTool } from "./list-messages.ts";
import { placeCallTool } from "./place-call.ts";
import { listCallsTool } from "./list-calls.ts";
import { getCallTool } from "./get-call.ts";
import { getAccountStatusTool } from "./get-account-status.ts";
import { signUpTool } from "./sign-up.ts";
import { onboardTool } from "./onboard.ts";
import { waitForEventTool } from "./wait-for-event.ts";
import { addUrlTargetTool } from "./add-url-target.ts";
import { addCommandTargetTool } from "./add-command-target.ts";
import { removeLocalTargetTool } from "./remove-local-target.ts";
import { listLocalTargetsTool } from "./list-local-targets.ts";
import { listenInstallTool } from "./listen-install.ts";
import { listenUninstallTool } from "./listen-uninstall.ts";
import { listenStatusTool } from "./listen-status.ts";

/** Every tool registered on the local stdio MCP server. */
export const tools: ToolModule[] = [
  listNumbersTool,
  purchaseNumberTool,
  setNumberPropertiesTool,
  sendMessageTool,
  replyToMessageTool,
  startTypingTool,
  stopTypingTool,
  listMessagesTool,
  placeCallTool,
  listCallsTool,
  getCallTool,
  getAccountStatusTool,
  signUpTool,
  onboardTool,
  waitForEventTool,
  addUrlTargetTool,
  addCommandTargetTool,
  removeLocalTargetTool,
  listLocalTargetsTool,
  listenInstallTool,
  listenUninstallTool,
  listenStatusTool,
];
