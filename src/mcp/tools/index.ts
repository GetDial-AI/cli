import type { ToolModule } from "../tool.ts";
import { listNumbersTool } from "./list-numbers.ts";
import { purchaseNumberTool } from "./purchase-number.ts";
import { setNumberPropertiesTool } from "./set-number-properties.ts";
import { sendMessageTool } from "./send-message.ts";
import { replyToMessageTool } from "./reply-to-message.ts";
import { startTypingTool } from "./start-typing.ts";
import { stopTypingTool } from "./stop-typing.ts";
import { listMessagesTool } from "./list-messages.ts";
import { listGroupsTool } from "./list-groups.ts";
import { placeCallTool } from "./place-call.ts";
import { listCallsTool } from "./list-calls.ts";
import { getCallTool } from "./get-call.ts";
import { getAccountStatusTool } from "./get-account-status.ts";
import { authLoginTool } from "./auth-login.ts";
import { authVerifyOtpTool } from "./auth-verify-otp.ts";
import { authRegisterNumberTool } from "./auth-register-number.ts";
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
  listGroupsTool,
  placeCallTool,
  listCallsTool,
  getCallTool,
  getAccountStatusTool,
  authLoginTool,
  authRegisterNumberTool,
  authVerifyOtpTool,
  waitForEventTool,
  addUrlTargetTool,
  addCommandTargetTool,
  removeLocalTargetTool,
  listLocalTargetsTool,
  listenInstallTool,
  listenUninstallTool,
  listenStatusTool,
];
