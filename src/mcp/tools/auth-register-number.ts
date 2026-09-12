import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { registerNumber, verifyNumber, PHONE_ALREADY_VERIFIED_CODE } from "../../lib/ops/account.ts";
import { isDialError } from "../../lib/ops/errors.ts";

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
      "that a phone number is still required. It should be a number the user keeps. Submit the " +
      "texted code with auth_verify_otp using number: true. If the number turns out to be already " +
      "verified — an earlier signup that stopped short of creating the account — this finishes that " +
      "signup instead, sends no text, and returns the account summary with resumed: true; do not ask " +
      "the user for a code in that case, and never restart the signup.",
    inputSchema,
    outputSchema: {
      registrationId: z.string().optional(),
      phoneNumber: z
        .string()
        .nullable()
        .optional()
        .describe("The number in canonical E.164 form. On the resumed path, the account's Dial number"),
      // The resume path returns the account instead of a pending send, so these are
      // optional rather than a second tool: the caller asked to get this number
      // registered, and that is what happened — just without a text.
      resumed: z
        .boolean()
        .optional()
        .describe("True when the number was already verified and this call finished the signup"),
      accountId: z.string().optional(),
      apiKeyFingerprint: z.string().optional().describe("Last 4 chars of the saved API key"),
      apiKeyPath: z.string().optional().describe("Where the key was saved"),
      email: z.string().nullable().optional(),
      phoneNumberId: z.string().nullable().optional(),
      dashboardUrl: z.string().optional(),
      skills: z.array(z.object({}).passthrough()).optional(),
      supervisor: z.object({}).passthrough().optional(),
      listenAvailable: z.boolean().optional(),
      note: z.string().optional(),
    },
    annotations: { openWorldHint: true },
  },
  run: async (args) => {
    const registrationId = args.registrationId as string | undefined;
    try {
      return jsonResult(
        await registerNumber({ phoneNumber: args.phoneNumber as string, registrationId }),
      );
    } catch (e) {
      // Already verified: a previous attempt got the code accepted and stopped
      // before the account existed. No text is coming, so reporting the failure
      // would leave the model waiting for a code the user can never produce — and
      // the obvious recovery, starting the signup over, returns this same
      // registration in this same state. Finish it here instead.
      if (!isDialError(e) || e.code !== PHONE_ALREADY_VERIFIED_CODE) throw e;
      const resumeId = (e.data?.registrationId as string | undefined) ?? registrationId;
      const r = await verifyNumber({ registrationId: resumeId });
      // Never surface the raw API key to the model; it is saved to disk for the CLI
      // to read. Same rule auth_verify_otp follows.
      const { apiKey: _omit, ...safe } = r;
      void _omit;
      return jsonResult({
        ...safe,
        resumed: true,
        listenAvailable: r.supervisor.available,
        note:
          "This number was already verified by an earlier signup attempt that stopped before the account was created, so no code was texted and nothing was charged. The account now exists and the API key is saved. Do NOT ask the user for a code, and do not start the signup again.",
      });
    }
  },
};
