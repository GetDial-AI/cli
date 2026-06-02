import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { onboard } from "../../lib/ops/account.ts";

const inputSchema = {
  code: z.string().min(1).describe("6-digit OTP from the sign-up email"),
  verificationId: z.string().optional().describe("Explicit verification id (defaults to the local pending signup)"),
  inboundInstruction: z.string().optional().describe("System prompt for inbound calls to a newly provisioned number (new accounts)"),
  agents: z.array(z.string()).optional().describe("Agent names to install the Dial skill into (e.g. claude-code, cursor)"),
};

export const onboardTool: ToolModule = {
  name: "onboard",
  config: {
    title: "Onboard",
    description:
      "Verify the sign-up OTP and finish onboarding: saves the API key locally and optionally installs " +
      "the Dial skill into named agents. Returns the account summary (the raw API key is never returned).",
    inputSchema,
    annotations: { openWorldHint: true },
  },
  run: async (args) => {
    const r = await onboard({
      code: args.code as string,
      verificationId: args.verificationId as string | undefined,
      inboundInstruction: args.inboundInstruction as string | undefined,
      agents: args.agents as string[] | undefined,
    });
    // Never surface the raw API key to the model; it's saved to disk for the CLI to read.
    const { apiKey: _omit, ...safe } = r;
    void _omit;
    return jsonResult({
      ...safe,
      listenAvailable: r.supervisor.available,
    });
  },
};
