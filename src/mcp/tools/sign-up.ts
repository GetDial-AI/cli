import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { signup } from "../../lib/ops/account.ts";

const inputSchema = {
  email: z.string().email().describe("Email address to send the sign-up OTP to"),
  force: z.boolean().optional().describe("Overwrite an existing fresh pending signup"),
};

export const signUpTool: ToolModule = {
  name: "sign_up",
  config: {
    title: "Sign Up",
    description:
      "Request an email OTP for a Dial account. The code is emailed; finish with the onboard tool. " +
      "Stores the pending verification locally.",
    inputSchema,
    outputSchema: {
      verificationId: z.string().describe("Pending verification id (also stored locally)"),
      email: z.string(),
    },
    annotations: { openWorldHint: true },
  },
  run: async (args) => jsonResult(await signup({ email: args.email as string, force: args.force as boolean | undefined })),
};
