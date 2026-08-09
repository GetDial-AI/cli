import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { registerNumber } from "../../lib/ops/account.ts";

const inputSchema = {
  phoneNumber: z
    .string()
    .describe(
      "The user's own phone number, in international form with the country code. Must be able to receive SMS. ASK THE USER for it — never invent one, and never use a Dial number (they are refused).",
    ),
  registrationId: z
    .string()
    .optional()
    .describe("Explicit registration id; falls back to the locally stored pending signup"),
};

/** Mirrors `dial auth register-number`. */
export const authRegisterNumberTool: ToolModule = {
  name: "auth_register_number",
  config: {
    title: "Auth Register Number",
    description:
      "Text a 6-digit verification code to the phone number that will own the account. Required to " +
      "CREATE an account (never needed to sign in), and only valid after auth_verify_otp reported " +
      "that a phone number is still required. The number becomes permanently bound to this " +
      "account — a number can register only one Dial account. Submit the texted code with " +
      "auth_verify_otp using number: true.",
    inputSchema,
    outputSchema: {
      registrationId: z.string(),
      phoneNumber: z.string().describe("The number in canonical E.164 form"),
    },
    annotations: { openWorldHint: true },
  },
  run: async (args) =>
    jsonResult(
      await registerNumber({
        phoneNumber: args.phoneNumber as string,
        registrationId: args.registrationId as string | undefined,
      }),
    ),
};
