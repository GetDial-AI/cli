import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { accountStatus } from "../../lib/ops/account.ts";

export const getAccountStatusTool: ToolModule = {
  name: "get_account_status",
  config: {
    title: "Get Account Status",
    description:
      "Report local Dial setup state: CLI version, backend reachability, sign-in/key validity, " +
      "any pending OTP, the listen daemon state, and the recommended next step.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async () => jsonResult(await accountStatus()),
};
