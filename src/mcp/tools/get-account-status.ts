import { z } from "zod";
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
    outputSchema: {
      cli: z.object({}).passthrough().describe("CLI and node versions"),
      backend: z.object({}).passthrough().describe("Backend URL and reachability"),
      auth: z.object({}).passthrough().describe("Sign-in and API-key state"),
      pendingOtp: z.object({}).passthrough().describe("Any pending sign-up OTP"),
      listen: z.object({}).passthrough().describe("Listen daemon state"),
      nextStep: z.string().describe("Recommended next step (signup, onboard, install_listen, ready, …)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  run: async () => jsonResult(await accountStatus()),
};
