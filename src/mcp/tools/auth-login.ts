import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { signup } from "../../lib/ops/account.ts";

const inputSchema = {
  email: z.string().email().describe("Email address to send the sign-up OTP to"),
  force: z.boolean().optional().describe("Overwrite an existing fresh pending signup"),
};

/** Mirrors `dial auth login`. */
export const authLoginTool: ToolModule = {
  name: "auth_login",
  config: {
    title: "Auth Login",
    description:
      "Request an email OTP to create a Dial account or sign in. The code is emailed; submit it " +
      "with the auth_verify_otp tool. Stores the pending verification locally.",
    inputSchema,
    outputSchema: {
      verificationId: z.string().describe("Pending verification id (also stored locally)"),
      email: z.string(),
    },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await signup({ email: args.email as string, force: args.force as boolean | undefined }),
    ),
};
